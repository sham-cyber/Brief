import { MAX_OFFLINE_BRIEFINGS, type SavedOfflineBriefing } from '@/lib/offline-briefings';

export function OfflineBriefingsPanel({
  items,
  isOnline,
  error,
  message,
  onOpen,
  onRemove,
  onClear,
}: {
  items: SavedOfflineBriefing[];
  isOnline: boolean;
  error: string | null;
  message: string;
  onOpen: (briefingId: string) => void;
  onRemove: (briefingId: string) => void;
  onClear: () => void;
}) {
  return (
    <details
      className="mb-4 rounded-xl border border-[#b7d7c0] bg-[#f4faf5] p-4 text-[#243c2c] shadow-sm"
      open={!isOnline || items.length === 0 ? undefined : false}
      data-testid="offline-briefings-panel"
    >
      <summary className="cursor-pointer list-none text-base font-bold">
        <span className="inline-flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isOnline ? 'bg-[#3c9260]' : 'bg-[#d07a35]'}`} aria-hidden="true" />
          Saved for offline · {items.length}/{MAX_OFFLINE_BRIEFINGS}
        </span>
      </summary>
      <div className="mt-3 border-t border-[#d4e6d8] pt-3">
        <p className="text-sm leading-relaxed">
          Public briefings you save here stay in this browser on this device. They are not encrypted or synced. Use only a trusted device. SAP and private-source results are never saved here.
        </p>
        {message && <p className="mt-2 text-sm font-semibold text-[#27603a]" role="status" data-testid="status-offline-save">{message}</p>}
        {error && (
          <div className="mt-3 rounded-lg border border-[#e2b7a9] bg-[#fff4f0] p-3 text-sm text-[#733a31]" role="alert" data-testid="status-offline-storage-error">
            <p>{error}</p>
            <button type="button" onClick={onClear} className="mt-2 min-h-10 rounded-md border border-[#a95d4c] px-3 font-semibold text-[#733a31]" data-testid="button-clear-unreadable-offline-data">
              Clear unreadable offline data
            </button>
          </div>
        )}
        {!isOnline && (
          <p className="mt-3 rounded-lg border border-[#efcfad] bg-[#fff8ee] px-3 py-2 text-sm font-semibold text-[#744716]" role="status" data-testid="status-offline-library">
            Offline now. Open, copy, print, or read saved briefs aloud. New searches and source websites need internet.
          </p>
        )}
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-[#526456]" data-testid="text-offline-empty">
            No offline copies saved yet. Open a completed public brief and choose “Save on this device.”
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((item) => (
              <li key={item.result.briefingId} className="flex flex-col gap-3 rounded-lg border border-[#d4e6d8] bg-white p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`offline-brief-${item.result.briefingId}`}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#243c2c]">{item.result.subject}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#526456]">
                    {item.result.topics.length} topic{item.result.topics.length === 1 ? '' : 's'} · saved {new Date(item.savedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => onOpen(item.result.briefingId)} className="min-h-10 rounded-lg bg-[#277347] px-3 text-sm font-bold text-white" data-testid={`button-open-offline-${item.result.briefingId}`}>
                    Open
                  </button>
                  <button type="button" onClick={() => onRemove(item.result.briefingId)} className="min-h-10 rounded-lg border border-[#bdcbbf] bg-white px-3 text-sm font-semibold text-[#3a5140]" aria-label={`Remove offline copy of ${item.result.subject}`} data-testid={`button-remove-offline-${item.result.briefingId}`}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
