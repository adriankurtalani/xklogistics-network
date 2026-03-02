import { supabase } from "./supabaseClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequestTransportErrorCode =
  | "route_not_found"
  | "route_not_available"
  | "duplicate_request"
  | "no_capacity"
  | "rpc_error";

export type RequestTransportResult =
  | { success: true;  requestId: string; remainingCapacity: number }
  | { success: false; errorCode: RequestTransportErrorCode; message: string };

/** Albanian user-facing messages for each server error code. */
const ERROR_MESSAGES: Record<RequestTransportErrorCode, string> = {
  route_not_found:      "Rruga nuk u gjet. Ringarko faqen dhe provo përsëri.",
  route_not_available:  "Kjo rrugë nuk është më e disponueshme.",
  duplicate_request:    "Keni tashmë një kërkesë aktive për këtë rrugë.",
  no_capacity:          "Kapaciteti i kësaj rruge është plotësuar.",
  rpc_error:            "Gabim i serverit. Provo përsëri.",
};

// ---------------------------------------------------------------------------
// requestTransport
// ---------------------------------------------------------------------------

/**
 * Calls the `request_transport` Supabase RPC function.
 *
 * The RPC runs inside a PostgreSQL transaction with a FOR UPDATE row lock on
 * the routes row, so concurrent calls are serialised server-side and the
 * frontend capacity value can never be trusted or bypassed.
 *
 * @param routeId     The route the business wants to book.
 * @param businessId  The authenticated business user's id.
 */
export async function requestTransport(
  routeId: string,
  businessId: string,
): Promise<RequestTransportResult> {
  const { data, error } = await supabase.rpc("request_transport", {
    p_route_id:    routeId,
    p_business_id: businessId,
  });

  // Supabase-level / network error
  if (error) {
    console.error("[requestTransport] RPC error:", error.message);
    return {
      success:   false,
      errorCode: "rpc_error",
      message:   ERROR_MESSAGES.rpc_error,
    };
  }

  // RPC returned a business-logic failure
  if (!data?.success) {
    const code = (data?.error_code ?? "rpc_error") as RequestTransportErrorCode;
    return {
      success:   false,
      errorCode: code,
      message:   ERROR_MESSAGES[code] ?? ERROR_MESSAGES.rpc_error,
    };
  }

  // Success
  return {
    success:           true,
    requestId:         data.request_id as string,
    remainingCapacity: data.remaining_capacity as number,
  };
}
