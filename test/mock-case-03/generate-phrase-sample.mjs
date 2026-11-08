// Generates a *clean* glossary fixture made of phrases and short sentences.
//
//   node test/mock-case-03/generate-phrase-sample.mjs
//   npm run gen:glossary-phrases
//
// Output (deterministic):
//   glossary-phrases.xlsx  — first sheet `Phrases` (importable data),
//                            second sheet `Readme` (notes, not imported by default).
//   glossary-phrases.csv   — same data as UTF-8 CSV (BOM + CRLF).
//
// Every English entry is intentionally either
//   • longer than six words, or
//   • terminated with `.` / `!` / `?` / `。` / `！` / `？`
// so `classifyEntryKind()` (src/main/modules/glossary/normalize.ts) stores it
// as `kind = 'phrase'` instead of `term`. That makes this file the counterpart
// of `test/mock-case-02/glossary-sample.xlsx` (which is a noisy parser fixture).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {object} PhraseRow
 * @property {string} en      en-US approved wording (phrase / short sentence)
 * @property {string} zhCN    zh-CN translation
 * @property {string} zhTW    zh-TW translation ('' → tests zh-CN fallback)
 * @property {string} [forbidden] "Do not use" variants, `|`-separated
 */

/** @type {PhraseRow[]} */
const ROWS = [
  // ── Safety / handling short sentences ────────────────────────────────────
  {
    en: 'During a firmware update, do not disconnect the power supply.',
    zhCN: '固件升级过程中，请勿断开电源。',
    zhTW: '韌體更新期間，請勿中斷電源供應。',
    forbidden: 'firmware upgrade',
  },
  {
    en: 'The device restarts automatically after the configuration is applied.',
    zhCN: '配置生效后，设备会自动重启。',
    zhTW: '設定生效後，裝置會自動重新啟動。',
    forbidden: 'the device will reboot by itself',
  },
  {
    en: 'Make sure the antenna is connected before you power on the module.',
    zhCN: '上电前请确认天线已连接。',
    zhTW: '開機前請確認天線已連接。',
  },
  {
    en: 'Do not expose the module to temperatures above 85 degrees Celsius.',
    zhCN: '请勿将模块暴露在 85 摄氏度以上的环境中。',
    zhTW: '請勿將模組暴露於 85 度 C 以上的環境中。',
  },
  {
    en: 'Read the safety instructions before you install the power supply.',
    zhCN: '安装电源前请阅读安全说明。',
    zhTW: '安裝電源前請閱讀安全說明。',
  },
  {
    en: 'Wait for the capacitor to discharge before you open the housing.',
    zhCN: '打开外壳前请等待电容放电完毕。',
    zhTW: '打開外殼前請等待電容放電完畢。',
  },
  {
    en: 'Replace the battery only with the same model or an equivalent type.',
    zhCN: '请仅使用同型号或同等规格的电池进行更换。',
    zhTW: '請僅使用同型號或同等規格的電池進行更換。',
  },
  {
    en: 'Keep the cable away from high-voltage lines.',
    zhCN: '请让电缆远离高压线。',
    zhTW: '請讓纜線遠離高壓線。',
  },

  // ── PWM / measurement short sentences ───────────────────────────────────
  {
    en: 'Keep the duty cycle below 50 percent to avoid overheating the driver.',
    zhCN: '请将占空比保持在 50% 以下，以免驱动器过热。',
    zhTW: '請將佔空比維持在 50% 以下，以免驅動器過熱。',
    forbidden: 'duty ratio',
  },
  {
    en: 'Connect the oscilloscope probe to the PWM output pin.',
    zhCN: '将示波器探头连接到 PWM 输出引脚。',
    zhTW: '將示波器探棒連接到 PWM 輸出腳位。',
  },
  {
    en: 'The measured signal does not match the configured frequency.',
    zhCN: '实测信号与配置频率不一致。',
    zhTW: '', // no zh-TW → zh-TW target falls back to zh-CN reference
  },
  {
    en: 'Verify the output voltage with a calibrated multimeter.',
    zhCN: '请使用已校准的万用表验证输出电压。',
    zhTW: '請使用已校正的電壓表驗證輸出電壓。',
    forbidden: 'multi-meter',
  },
  {
    en: 'Tighten the screws to a torque of 1.5 newton-meters.',
    zhCN: '请将螺钉拧紧至 1.5 牛米的扭矩。',
    zhTW: '請將螺絲鎖緊至 1.5 牛頓米的扭力。',
  },
  {
    en: 'All measurements were taken at room temperature.',
    zhCN: '所有测量均在室温下完成。',
    zhTW: '所有量測均在室溫下完成。',
    forbidden: 'room temp',
  },
  {
    en: 'The LED flashes three times when the self-test passes.',
    zhCN: '自检通过时，LED 会闪烁三次。',
    zhTW: '自我測試通過時，LED 會閃爍三次。',
  },

  // ── UI / operating instructions ─────────────────────────────────────────
  {
    en: 'Press and hold the reset button for five seconds to restore the defaults.',
    zhCN: '按住复位按钮五秒可恢复默认设置。',
    zhTW: '按住重設按鈕五秒可還原預設值。',
    forbidden: 'restart button | reboot button',
  },
  {
    en: 'Apply power only after the wiring is complete.',
    zhCN: '请仅在接线完成后上电。',
    zhTW: '請僅在接線完成後通電。',
    forbidden: 'turn on the power',
  },
  {
    en: 'Do not touch the heat sink during operation.',
    zhCN: '运行期间请勿触摸散热片。',
    zhTW: '運轉期間請勿觸碰散熱片。',
    forbidden: 'heatsink',
  },
  {
    en: 'Reboot the controller if the display is blank.',
    zhCN: '如果显示屏无显示，请重启控制器。',
    zhTW: '如果顯示器沒有畫面，請重新啟動控制器。',
    forbidden: 'restart the controller',
  },
  {
    en: 'Use a shielded cable for the signal input.',
    zhCN: '信号输入请使用屏蔽电缆。',
    zhTW: '', // no zh-TW
  },
  {
    en: 'Close the enclosure before you start the test.',
    zhCN: '开始测试前请合上外壳。',
    zhTW: '開始測試前請關閉外殼。',
  },
  {
    en: 'If the error persists, contact technical support.',
    zhCN: '如果错误仍然存在，请联系技术支持。',
    zhTW: '如果錯誤仍然存在，請聯絡技術支援。',
    forbidden: 'tech support',
  },
  {
    en: 'The system enters low-power mode after thirty seconds of inactivity.',
    zhCN: '系统在三十秒无操作后进入低功耗模式。',
    zhTW: '系統在三十秒無操作後進入低功耗模式。',
  },

  // ── Documentation boilerplate ───────────────────────────────────────────
  {
    en: 'This section describes how to configure the PWM peripheral.',
    zhCN: '本节介绍如何配置 PWM 外设。',
    zhTW: '本節說明如何設定 PWM 周邊。',
  },
  {
    en: 'The following table lists the supported operating voltages.',
    zhCN: '下表列出了支持的工作电压。',
    zhTW: '下表列出支援的工作電壓。',
  },
  {
    en: 'Configuration changes take effect only after a full power cycle.',
    zhCN: '配置更改仅在完全断电重启后生效。',
    zhTW: '設定變更僅在完全斷電重新啟動後生效。',
  },
  {
    en: 'The warranty does not cover damage caused by improper installation.',
    zhCN: '因安装不当造成的损坏不在保修范围内。',
    zhTW: '因安裝不當造成的損壞不在保固範圍內。',
  },
  {
    en: 'Record the serial number before you return the module.',
    zhCN: '退回模块前请记录序列号。',
    zhTW: '退回模組前請記錄序號。',
  },
  {
    en: 'Make sure the grounding terminal is connected to earth.',
    zhCN: '请确认接地端子已连接到大地。',
    zhTW: '請確認接地端子已連接到大地。',
  },
  {
    en: 'Replace the filter every twelve months or after 2000 hours of operation.',
    zhCN: '请每十二个月或在运行 2000 小时后更换过滤器。',
    zhTW: '請每十二個月或在運轉 2000 小時後更換濾網。',
    forbidden: 'air filter',
  },

  // ── Long noun phrases (also classified as `phrase`: > 6 words) ──────────
  {
    en: 'Recommended operating conditions for the PWM output stage',
    zhCN: 'PWM 输出级的推荐工作条件',
    zhTW: 'PWM 輸出級的建議工作條件',
  },
  {
    en: 'Maximum allowable junction temperature of the voltage regulator',
    zhCN: '稳压器的最高允许结温',
    zhTW: '穩壓器的最高允許接面溫度',
  },
  {
    en: 'Factory default configuration of the timer module',
    zhCN: '定时器模块的出厂默认配置',
    zhTW: '計時器模組的出廠預設設定',
  },
  {
    en: 'Electrical isolation requirements for the control cabinet',
    zhCN: '控制柜的电气隔离要求',
    zhTW: '控制櫃的電氣隔離要求',
  },
  {
    en: 'Recommended storage conditions for lithium battery packs',
    zhCN: '锂电池组的推荐存储条件',
    zhTW: '鋰電池組的建議儲存條件',
  },
  {
    en: 'Periodic maintenance schedule for the cooling fan assembly',
    zhCN: '冷却风扇组件的定期维护计划',
    zhTW: '冷卻風扇組件的定期保養排程',
  },
  {
    en: 'Important safety precautions when handling electrostatic-sensitive devices',
    zhCN: '处理静电敏感器件时的重要安全注意事项',
    zhTW: '處理靜電敏感元件時的重要安全注意事項',
  },
  {
    en: 'Typical wiring diagram of the analog input module',
    zhCN: '模拟量输入模块的典型接线图',
    zhTW: '類比輸入模組的典型接線圖',
    forbidden: 'connection diagram',
  },
  {
    en: 'Design guidelines for electromagnetic compatibility and immunity testing',
    zhCN: '电磁兼容性与抗扰度测试的设计指南',
    zhTW: '電磁相容性與抗擾度測試的設計指南',
  },
  {
    en: 'Step-by-step procedure to calibrate the current sensor',
    zhCN: '校准电流传感器的分步操作步骤',
    zhTW: '校正電流感測器的逐步操作程序',
  },
  {
    en: 'Troubleshooting checklist for recurring communication timeout errors',
    zhCN: '通信超时错误的排查清单',
    zhTW: '通訊逾時錯誤的疑難排解檢查清單',
  },
  {
    en: 'Minimum clearance between the heat sink and the enclosure wall',
    zhCN: '散热片与外壳壁之间的最小间隙',
    zhTW: '散熱片與外殼壁之間的最小間隙',
  },
];

const HEADER = ['No.', 'en-US', 'zh-CN', 'zh-TW', 'Do not use'];
const SHEET_NAME = 'Phrases';

/** Word-split + sentence-end check that mirrors classifyEntryKind(). */
function classify(en) {
  const text = en.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').trim();
  if (/[.!?。！？]$/.test(text)) return 'phrase';
  const words = text.split(/[\s\u3000]+/).filter(Boolean);
  return words.length <= 6 ? 'term' : 'phrase';
}

function assertAllPhrases() {
  const offenders = ROWS.filter((row) => classify(row.en) !== 'phrase');
  if (offenders.length > 0) {
    throw new Error(
      `These rows would be imported as "term" instead of "phrase":\n` +
        offenders.map((r) => `  - ${r.en}`).join('\n'),
    );
  }
}

function styleHeader(row) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  });
}

async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'smart-tech-writer test fixtures';
  workbook.created = new Date(2026, 10, 8);

  const sheet = workbook.addWorksheet(SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { width: 6 },
    { width: 78 },
    { width: 46 },
    { width: 46 },
    { width: 28 },
  ];

  sheet.addRow(HEADER);
  styleHeader(sheet.getRow(1));

  ROWS.forEach((row, index) => {
    const added = sheet.addRow([
      index + 1,
      row.en,
      row.zhCN,
      row.zhTW ?? '',
      row.forbidden ?? '',
    ]);
    added.alignment = { vertical: 'top', wrapText: true };
    added.getCell(1).alignment = { vertical: 'top', horizontal: 'right' };
  });

  sheet.autoFilter = { from: 'A1', to: `E${ROWS.length + 1}` };

  // Second sheet: notes only. The importer reads sheet 0 by default.
  const readme = workbook.addWorksheet('Readme');
  readme.columns = [{ width: 110 }];
  for (const line of [
    'Glossary test fixture — phrases and short sentences (smart-tech-writer).',
    '',
    `Data sheet: "${SHEET_NAME}" (column layout No. / en-US / zh-CN / zh-TW / Do not use).`,
    'Every English entry is a phrase or a short sentence, so it is imported as kind = "phrase".',
    '',
    'Suggested checks:',
    '  • Settings → 术语 & 用语映射 → 导入 Excel/CSV → 选择本文件（sheet = Phrases）。',
    '  • 预览应显示 "列识别: A=No. B=en-US C=zh-CN D=zh-TW E=Do not use"，模式/冲突处理按需选择。',
    '  • 导入后统计中 "用语" 条数应等于数据行数（' + ROWS.length + '）。',
    '  • 少数行 zh-TW 为空，用于验证 zh-TW 目标语言的 zh-CN 回退（提示词中出现 "(zh-CN reference)"）。',
    '  • "Do not use" 列用于 R7 禁用写法检查（可一键替换）。',
    '  • 匹配试验场（场景=translation / 目标语言=zh-CN）粘贴对应英文句子，应命中本文件条目。',
  ]) {
    readme.addRow([line]);
  }
  readme.getRow(1).font = { bold: true };

  return workbook;
}

function toCsv() {
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [HEADER.join(',')];
  ROWS.forEach((row, index) => {
    lines.push(
      [index + 1, row.en, row.zhCN, row.zhTW ?? '', row.forbidden ?? '']
        .map(escape)
        .join(','),
    );
  });
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

async function main() {
  assertAllPhrases();

  const workbook = await buildWorkbook();
  const xlsxPath = path.join(here, 'glossary-phrases.xlsx');
  await workbook.xlsx.writeFile(xlsxPath);

  const csvPath = path.join(here, 'glossary-phrases.csv');
  fs.writeFileSync(csvPath, toCsv(), 'utf-8');

  const phrases = ROWS.length;
  const withZhTw = ROWS.filter((row) => row.zhTW).length;
  const withForbidden = ROWS.filter((row) => row.forbidden).length;

  console.log(`Wrote ${xlsxPath}`);
  console.log(`Wrote ${csvPath}`);
  console.log(
    `Rows: ${phrases} phrases · zh-TW ${withZhTw}/${phrases} · Do not use ${withForbidden}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
