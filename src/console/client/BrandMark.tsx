/** The sidebar/header brand — logo (if `ratchet.config.ts`'s `brand.logoUrl` is set) plus a name,
 * defaulting to "Ratchet console". Shared by `Layout`'s sidebar header and `WorkspacePage`'s top
 * header so the two headers stay in sync without each re-reading `__CONSOLE_BRAND__` itself. */
export function BrandMark() {
  return (
    <>
      {__CONSOLE_BRAND__.logoUrl && (
        <img src={__CONSOLE_BRAND__.logoUrl} alt="" className="h-5 w-5 shrink-0 rounded object-contain" />
      )}
      <p className="truncate text-sm font-semibold text-gray-900">{__CONSOLE_BRAND__.name ?? 'Ratchet console'}</p>
    </>
  );
}
