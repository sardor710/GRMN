/** Image uploads (/api/admin/uploads): catalog editors for product photos, content editors for homepage images. */
export function canUploadMedia(permissions: readonly string[]): boolean {
  return permissions.includes("catalog:write") || permissions.includes("content:write");
}
