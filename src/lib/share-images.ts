/** Call from the click handler with files already prepared to retain user activation. */
export async function shareImages(files: File[], text: string): Promise<"shared" | "unsupported" | "cancelled"> {
  if (files.length !== 2 || !navigator.share || !navigator.canShare?.({ files })) return "unsupported";
  try {
    await navigator.share({ files, text });
    return "shared";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    throw error;
  }
}
