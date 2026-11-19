import { useEffect, useState } from "react";
import { useTranslation } from "@/languages";
import { Button } from "@/shared/ui";
import { SettingRow } from "../controls";

/**
 * Where manually downloaded tracks land. The folder is picked with the native
 * dialog and stored by the main process.
 */
export function DownloadsFolderRow({ searchQuery }: { searchQuery?: string }) {
  const { t } = useTranslation();
  const electron = typeof window !== "undefined" ? window.linerElectron : null;
  const [folder, setFolder] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    electron
      ?.getDownloadsFolder?.()
      .then((value) => {
        if (!cancelled) setFolder(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [electron]);

  if (!electron?.getDownloadsFolder) return null;

  const change = async () => {
    const picked = await electron.chooseDownloadsFolder?.().catch(() => null);
    if (picked) setFolder(picked);
  };

  return (
    <SettingRow
      title={t("settings.storage.downloads_folder")}
      description={folder ?? t("settings.storage.downloads_folder_loading")}
      explained
      titleKey="settings.storage.downloads_folder"
      searchQuery={searchQuery}
      control={
        <div className="flex items-center gap-[8px]">
          <Button variant="secondary" size="sm" onClick={() => void change()}>
            {t("settings.storage.downloads_folder_change")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void electron.openDownloadsFolder?.().catch(() => {})}
          >
            {t("settings.storage.downloads_folder_open")}
          </Button>
        </div>
      }
    />
  );
}
