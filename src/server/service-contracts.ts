import type { Page, PageInput } from "../contracts/pagination.ts";
import type {
  CheckoutCommand, CheckoutQuoteDTO, CheckoutResultDTO, DisplayCurrency,
  OrderDetailDTO, OrderSummaryDTO, OrderTransitionCommand,
  ProductCardDTO, ProductDetailDTO, ProductQuery, QuoteCommand,
} from "../contracts/commerce.ts";
import type { CartActor, Principal } from "./context.ts";

// Implementations arrive in later tasks; this interface opens no connection.
export interface CommerceServices {
  listProducts(query: ProductQuery, page: PageInput): Promise<Page<ProductCardDTO>>;
  getProductByPublicKey(key: string, market: string, displayCurrency: DisplayCurrency): Promise<ProductDetailDTO | null>;
  getOwnOrders(principal: Principal, page: PageInput): Promise<Page<OrderSummaryDTO>>;
  getOwnOrder(principal: Principal, orderId: string): Promise<OrderDetailDTO>;
  quoteCart(actor: CartActor, command: QuoteCommand): Promise<CheckoutQuoteDTO>;
  createCheckout(actor: CartActor, command: CheckoutCommand, idempotencyKey: string): Promise<CheckoutResultDTO>;
  transitionOrder(principal: Principal, command: OrderTransitionCommand): Promise<OrderDetailDTO>;
}
