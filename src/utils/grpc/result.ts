import { ClientUnaryCall } from "@grpc/grpc-js";
import { ServiceError } from "@/utils/grpc/error";

type ServiceMethod<T> = (
  request: T,
  // Response comes from the specific method that is being called
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (error: ServiceError | null, response: any) => void,
) => ClientUnaryCall;

/**
 * Takes a gRPC method and its request object, and returns a promise that resolves
 * with a tuple of [error, response].
 */
export function result<Request, Func extends ServiceMethod<Request>>(
  func: Func,
  request: Request,
) {
  type CallbackType = Extract<
    Parameters<Func>[number],
    // We only care about the callback function being a function
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (...args: any[]) => void
  >;
  type CallbackArgs = Parameters<CallbackType>;
  return new Promise<CallbackArgs>((resolve) => {
    try {
      func(request, (err, res) => {
        resolve([err, res] as CallbackArgs);
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.includes("checkOptionalUnaryResponseArguments")
      ) {
        throw new Error(
          "Error checking response arguments. Please ensure the incoming method is bound to the client.",
        );
      }
      throw err;
    }
  });
}

/**
 * Takes a gRPC client and returns a proxied client that will autobind all methods.
 */
export function autobind<T extends object>(client: T) {
  return new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value === "function") {
        return value.bind(target);
      }
      return value;
    },
  });
}
