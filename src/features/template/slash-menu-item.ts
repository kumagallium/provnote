// /template スラッシュメニューアイテム

import { t } from "../../i18n";

// テンプレートピッカーを開くグローバルコールバック（スラッシュ発火時のブロックを渡す）
// note-app.tsx 側で登録する
let _openTemplatePickerCallback: ((triggerBlock: any) => void) | null = null;

export function setTemplatePickerCallback(fn: ((triggerBlock: any) => void) | null) {
  _openTemplatePickerCallback = fn;
}

export function getTemplateSlashMenuItem() {
  return {
    title: t("template.slash.title"),
    subtext: t("template.slash.sub"),
    group: t("slash.advancedGroup"),
    aliases: [
      "template",
      "テンプレート",
      "てんぷれーと",
      "plan",
      "計画",
      "experiment",
      "実験",
    ],
    onItemClick: (editor: any) => {
      const currentBlock = editor.getTextCursorPosition().block;
      _openTemplatePickerCallback?.(currentBlock);
    },
  };
}
