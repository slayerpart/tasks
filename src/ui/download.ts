/** Saves the data as a JSON file in the downloads of the browser. */
export function downloadJson(data: unknown, fileName: string): void {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // The download has its own copy now.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
