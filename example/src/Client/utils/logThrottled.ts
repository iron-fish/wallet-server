export function logThrottled(msg: string, every: number, current: number) {
  if (current % every === 0) {
    console.log(msg);
    return true;
  }

  return false;
}
