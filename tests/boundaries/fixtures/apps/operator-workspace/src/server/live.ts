// Deliberately forbidden: the client cache reaching into the server funnel.
// ADR 0019 confines @tanstack/react-query to feature folders and the providers
// directory — a QueryClient constructed on a server path is one object shared
// by every concurrent request, which is one tenant's rows dehydrated into
// another tenant's HTML. scripts/dependency-boundaries.mjs asserts this is
// detected.
import { QueryClient } from "@tanstack/react-query";

export const shared = new QueryClient();
