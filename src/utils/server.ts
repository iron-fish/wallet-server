import {
  handleUnaryCall,
  sendUnaryData,
  ServerUnaryCall,
  status,
} from "@grpc/grpc-js";
import { ServiceError } from "@/utils/error";

export function handle<RequestType, ResponseType>(
  cb: (
    call: ServerUnaryCall<RequestType, ResponseType>,
    callback: sendUnaryData<ResponseType>,
  ) => void,
): handleUnaryCall<RequestType, ResponseType> {
  return async (
    call: ServerUnaryCall<RequestType, ResponseType>,
    callback: sendUnaryData<ResponseType>,
  ) => {
    try {
      await cb(call, callback);
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Internal server error";

      callback(new ServiceError(status.INTERNAL, message), null);
    }
  };
}
