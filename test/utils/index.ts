/* eslint-disable @typescript-eslint/no-explicit-any */

type Done = <T extends (...args: Array<any>) => any>(handler: T) => any;

export function until(cb: (done: Done) => void) {
  return new Promise<void>((resolve, reject) => {
    const done: Done = function (handler) {
      return (...args: Parameters<typeof handler>) => {
        try {
          handler(...args);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
    };

    cb(done);
  });
}
