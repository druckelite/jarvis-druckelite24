/* JARVIS V12.4 · SHOPIFY AGENT */

function timeoutSignal(ms) {
  try { return AbortSignal.timeout(ms); } catch { return undefined; }
}

function clean(value) {
  return String(value ?? "").trim();
}

export function createShopifyAgent({
  getAccessToken,
  getStoreDomain,
  getApiVersion
}) {
  let pendingWrite = null;

  async function graphql(query, variables = {}) {
    const response = await fetch(
      `https://${getStoreDomain()}/admin/api/${getApiVersion()}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": await getAccessToken()
        },
        body: JSON.stringify({ query, variables }),
        signal: timeoutSignal(20000)
      }
    );

    const data = await response.json();

    if (!response.ok || data.errors) {
      throw new Error(
        data?.errors?.[0]?.message ||
        "Shopify GraphQL fehlgeschlagen."
      );
    }

    return data.data;
  }

  function assertUserErrors(errors) {
    if (Array.isArray(errors) && errors.length) {
      throw new Error(
        errors.map(x => x?.message).filter(Boolean).join("; ")
      );
    }
  }

  async function productSearch(queryText, limit = 10) {
    const query = `
      query JarvisProducts($first: Int!, $query: String) {
        products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id title handle status vendor productType totalInventory onlineStoreUrl
            seo { title description }
            featuredMedia {
              preview { image { url altText } }
            }
            variants(first: 25) {
              nodes {
                id title sku price compareAtPrice inventoryQuantity
                inventoryItem { id tracked }
              }
            }
          }
        }
      }
    `;

    const data = await graphql(query, {
      first: Math.max(1, Math.min(25, Number(limit) || 10)),
      query: clean(queryText) || null
    });

    return { action: "product_search", products: data.products?.nodes || [] };
  }

  async function lowStock(threshold = 5, limit = 50) {
    const query = `
      query JarvisLowStock($first: Int!) {
        productVariants(first: $first, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id title sku inventoryQuantity
            product { id title status handle }
            inventoryItem { id tracked }
          }
        }
      }
    `;

    const data = await graphql(query, {
      first: Math.max(1, Math.min(100, Number(limit) || 50))
    });

    const max = Number(threshold);

    return {
      action: "low_stock",
      threshold: max,
      variants: (data.productVariants?.nodes || []).filter(
        item =>
          item?.inventoryItem?.tracked !== false &&
          Number(item?.inventoryQuantity ?? 0) <= max
      )
    };
  }

  async function filesMissingAlt(limit = 50) {
    const query = `
      query JarvisFiles($first: Int!) {
        files(first: $first, sortKey: CREATED_AT, reverse: true) {
          nodes {
            __typename
            ... on MediaImage {
              id alt fileStatus
              image { url width height }
            }
            ... on GenericFile {
              id alt url fileStatus
            }
          }
        }
      }
    `;

    const data = await graphql(query, {
      first: Math.max(1, Math.min(100, Number(limit) || 50))
    });

    const files = (data.files?.nodes || []).filter(
      file => Object.prototype.hasOwnProperty.call(file, "alt") && !clean(file.alt)
    );

    return { action: "files_missing_alt", count: files.length, files };
  }

  async function customerSearch(queryText, limit = 10) {
    const query = `
      query JarvisCustomers($first: Int!, $query: String) {
        customers(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
          nodes {
            id displayName firstName lastName email phone numberOfOrders
            amountSpent { amount currencyCode }
            tags
          }
        }
      }
    `;

    const data = await graphql(query, {
      first: Math.max(1, Math.min(25, Number(limit) || 10)),
      query: clean(queryText) || null
    });

    return { action: "customer_search", customers: data.customers?.nodes || [] };
  }

  async function orderGet(orderName) {
    const query = `
      query JarvisOrder($query: String!) {
        orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id name createdAt displayFinancialStatus displayFulfillmentStatus
            cancelledAt note tags
            customer { id displayName email phone }
            currentTotalPriceSet { shopMoney { amount currencyCode } }
            shippingAddress { name company address1 address2 zip city country }
            lineItems(first: 100) {
              nodes {
                id name quantity sku variantTitle
                product { id title }
                originalUnitPriceSet { shopMoney { amount currencyCode } }
              }
            }
            fulfillments(first: 20) {
              id status
              trackingInfo { company number url }
            }
          }
        }
      }
    `;

    const data = await graphql(query, {
      query: `name:${clean(orderName)}`
    });

    const order = data.orders?.nodes?.[0];
    if (!order) throw new Error("Bestellung nicht gefunden.");

    return { action: "order_get", order };
  }

  function prepareWrite(action, payload) {
    const allowed = new Set([
      "product_update",
      "file_alt_update",
      "product_tags_add",
      "product_tags_remove",
      "order_note_update"
    ]);

    if (!allowed.has(action)) {
      throw new Error("Diese Shopify-Schreibaktion ist noch nicht freigeschaltet.");
    }

    pendingWrite = {
      id: `shopify-${Date.now()}`,
      action,
      payload,
      created_at: new Date().toISOString()
    };

    return {
      prepared: true,
      requires_confirmation: true,
      pending_write: pendingWrite
    };
  }

  async function executeProductUpdate(payload) {
    const product = { id: clean(payload.product_id) };

    if (!product.id.startsWith("gid://shopify/Product/")) {
      throw new Error("Gültige Product-ID fehlt.");
    }

    if (payload.title !== undefined) product.title = clean(payload.title);
    if (payload.description_html !== undefined) product.descriptionHtml = String(payload.description_html || "");
    if (payload.vendor !== undefined) product.vendor = clean(payload.vendor);
    if (payload.product_type !== undefined) product.productType = clean(payload.product_type);

    if (payload.status !== undefined) {
      const status = clean(payload.status).toUpperCase();
      if (!["ACTIVE","DRAFT","ARCHIVED"].includes(status)) {
        throw new Error("Status muss ACTIVE, DRAFT oder ARCHIVED sein.");
      }
      product.status = status;
    }

    if (payload.seo_title !== undefined || payload.seo_description !== undefined) {
      product.seo = {};
      if (payload.seo_title !== undefined) product.seo.title = clean(payload.seo_title);
      if (payload.seo_description !== undefined) product.seo.description = clean(payload.seo_description);
    }

    const mutation = `
      mutation JarvisProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id title handle status vendor productType
            seo { title description }
          }
          userErrors { field message }
        }
      }
    `;

    const data = await graphql(mutation, { product });
    assertUserErrors(data.productUpdate?.userErrors);

    return { changed: true, action: "product_update", product: data.productUpdate?.product };
  }

  async function executeFileAlt(payload) {
    const mutation = `
      mutation JarvisFileUpdate($files: [FileUpdateInput!]!) {
        fileUpdate(files: $files) {
          files { id alt }
          userErrors { field message }
        }
      }
    `;

    const data = await graphql(mutation, {
      files: [{ id: clean(payload.file_id), alt: clean(payload.alt) }]
    });

    assertUserErrors(data.fileUpdate?.userErrors);

    return { changed: true, action: "file_alt_update", files: data.fileUpdate?.files || [] };
  }

  async function executeTags(action, payload) {
    const mutationName = action === "product_tags_add" ? "tagsAdd" : "tagsRemove";
    const mutation = `
      mutation JarvisTags($id: ID!, $tags: [String!]!) {
        ${mutationName}(id: $id, tags: $tags) {
          node { id }
          userErrors { field message }
        }
      }
    `;

    const tags = Array.isArray(payload.tags)
      ? payload.tags.map(clean).filter(Boolean)
      : clean(payload.tags).split(",").map(clean).filter(Boolean);

    const data = await graphql(mutation, {
      id: clean(payload.resource_id),
      tags
    });

    assertUserErrors(data[mutationName]?.userErrors);

    return { changed: true, action, tags };
  }

  async function executeOrderNote(payload) {
    const mutation = `
      mutation JarvisOrderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order { id name note }
          userErrors { field message }
        }
      }
    `;

    const data = await graphql(mutation, {
      input: {
        id: clean(payload.order_id),
        note: String(payload.note || "")
      }
    });

    assertUserErrors(data.orderUpdate?.userErrors);

    return { changed: true, action: "order_note_update", order: data.orderUpdate?.order };
  }

  async function confirmWrite(confirmationText) {
    if (!pendingWrite) throw new Error("Keine vorbereitete Shopify-Änderung vorhanden.");

    if (!/\b(ja|ok|okay|bestätigen|freigeben|ausführen|mach|machen|ändern)\b/i.test(clean(confirmationText))) {
      throw new Error("Shopify-Änderung wurde nicht eindeutig freigegeben.");
    }

    const current = pendingWrite;
    pendingWrite = null;

    if (current.action === "product_update") return executeProductUpdate(current.payload);
    if (current.action === "file_alt_update") return executeFileAlt(current.payload);
    if (current.action === "product_tags_add" || current.action === "product_tags_remove") {
      return executeTags(current.action, current.payload);
    }
    if (current.action === "order_note_update") return executeOrderNote(current.payload);

    throw new Error("Unbekannte vorbereitete Shopify-Aktion.");
  }

  async function run(action, args = {}) {
    switch (action) {
      case "product_search": return productSearch(args.query, args.limit);
      case "low_stock": return lowStock(args.threshold, args.limit);
      case "files_missing_alt": return filesMissingAlt(args.limit);
      case "customer_search": return customerSearch(args.query, args.limit);
      case "order_get": return orderGet(args.order_name);

      case "product_update":
      case "file_alt_update":
      case "product_tags_add":
      case "product_tags_remove":
      case "order_note_update":
        return prepareWrite(action, args);

      case "pending_write":
        return { pending_write: pendingWrite };

      case "confirm_write":
        return confirmWrite(args.confirmation_text);

      default:
        throw new Error(`Unbekannte Shopify-Agent-Aktion: ${action}`);
    }
  }

  return { run };
}
