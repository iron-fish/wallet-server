export async function wait(ms = 60000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
