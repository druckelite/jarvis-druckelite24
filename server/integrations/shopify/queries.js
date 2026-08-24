// server/integrations/shopify/queries.js
// GraphQL documents for the Shopify Admin API (version 2025-07).
// All queries are read-only. No mutations exist in this file.
//
// NOTE on read_orders scope:
//   Access is limited to approximately the last 60 days without the elevated
//   read_all_orders scope. The 30-day product revenue query is within that
//   limit. Inform the client if they need longer historical ranges.

/**
 * Fetch the N most recent orders.
 * Returns: id, name, customer displayName, totalPriceSet, createdAt, displayFulfillmentStatus
 */
export const RECENT_ORDERS_QUERY = `
  query RecentOrders($limit: Int!) {
    orders(first: $limit, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          displayFulfillmentStatus
          createdAt
          totalPriceSet {
            shopMoney { amount currencyCode }
          }
          customer {
            displayName
          }
        }
      }
    }
  }
`;

/**
 * Fetch all orders placed within a date range to compute daily revenue.
 * We fetch in pages of 250 and aggregate server-side.
 * Variables: createdAtMin (ISO string), createdAtMax (ISO string)
 */
export const ORDERS_IN_RANGE_QUERY = `
  query OrdersInRange($createdAtMin: String!, $createdAtMax: String!, $cursor: String) {
    orders(
      first: 250
      query: "created_at:>=$createdAtMin created_at:<=$createdAtMax financial_status:paid"
      after: $cursor
      sortKey: CREATED_AT
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          createdAt
          totalPriceSet {
            shopMoney { amount currencyCode }
          }
        }
      }
    }
  }
`;

/**
 * Fetch line-item level data to aggregate revenue and quantity by product.
 * Variables: createdAtMin (ISO string), createdAtMax (ISO string), cursor
 */
export const PRODUCT_REVENUE_QUERY = `
  query ProductRevenue($createdAtMin: String!, $createdAtMax: String!, $cursor: String) {
    orders(
      first: 250
      query: "created_at:>=$createdAtMin created_at:<=$createdAtMax financial_status:paid"
      after: $cursor
      sortKey: CREATED_AT
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          lineItems(first: 50) {
            edges {
              node {
                title
                quantity
                originalTotalSet {
                  shopMoney { amount currencyCode }
                }
              }
            }
          }
        }
      }
    }
  }
`;
