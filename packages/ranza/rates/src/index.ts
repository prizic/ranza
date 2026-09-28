export { createRatesModule } from "./module";
export type { RatesModule } from "./module";
export type { RatesDeps } from "./ports";
export {
  PRICE_MAX_MINOR,
  PRICED_UNIT_TYPES,
  RATES_CAPABILITY,
  RATES_MANAGE_PERMISSION,
  RatesInputError,
  RatesRefusedError,
  RatesStaleError,
} from "./contracts";
export type {
  PriceChange,
  PriceList,
  PriceListEntry,
  PricedUnitType,
  PricesInput,
  PricesSaved,
} from "./contracts";
