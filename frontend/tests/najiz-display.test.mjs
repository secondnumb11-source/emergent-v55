// Unit tests for the Najiz display parser.
// Run with: bun tests/najiz-display.test.mjs
import { test, expect } from "bun:test";
import {
  spaceOutKeywords,
  sliceByKeywords,
  parseExecutionRow,
  parsePowerRow,
  cleanNajizTitle,
  hasStructuredExecution,
  hasStructuredPower,
  prettyFallback,
  NAJIZ_EXEC_KEYWORDS,
  NAJIZ_POWER_KEYWORDS,
} from "../src/lib/najiz-display.ts";

test("spaceOutKeywords splits glued Arabic labels", () => {
  // Single-token keywords: parser inserts spaces before them when glued.
  const glued = "أحمدالوكيلخالد";
  const spaced = spaceOutKeywords(glued, NAJIZ_POWER_KEYWORDS);
  expect(spaced).toContain(" الوكيل");
});

test("sliceByKeywords returns ordered { label, value } pairs", () => {
  const s = "رقم الوكالة 123456 تاريخ الإصدار 1447/01/01 تاريخ الانتهاء 1450/01/01";
  const slices = sliceByKeywords(s, NAJIZ_POWER_KEYWORDS);
  const labels = slices.map((x) => x.label);
  expect(labels).toContain("رقم الوكالة");
  expect(labels).toContain("تاريخ الإصدار");
  expect(labels).toContain("تاريخ الانتهاء");
});

test("parseExecutionRow extracts creditor / debtor from run-on blob", () => {
  const row = {
    execution_data:
      "المحكمة محكمة التنفيذ بالرياض نوع الطلب مطالبة مالية المنفذ شركة أ الصفة مدعي هوية وطنية رقم الهوية 1010101010 المنفذ ضده محمد بن علي الصفة مدعى عليه هوية وطنية رقم الهوية 2020202020 الجنسية سعودي المبلغ المستحق 50000 ر.س",
    amount: 50000,
  };
  const p = parseExecutionRow(row);
  expect(p.court).toContain("التنفيذ");
  expect(p.requestType).toContain("مطالبة");
  expect(p.creditor.name).toContain("شركة");
  expect(p.creditor.idNumber).toBe("1010101010");
  expect(p.debtor.name).toContain("محمد");
  expect(p.debtor.idNumber).toBe("2020202020");
  expect(p.debtor.nationality).toBe("سعودي");
  expect(hasStructuredExecution(p)).toBe(true);
});

test("parsePowerRow extracts wakalah number, dates and both parties", () => {
  const row = {
    wakalah_number: "381234567890",
    issue_date: "1446/03/15",
    expiry_date: "1449/03/15",
    issuer_entity: "جهة الإصدار كتابة العدل بجدة",
    issuer_name:
      "عبدالله بن أحمد الصفة أصالة عن نفسه الجنسية سعودي نوع الهوية هوية وطنية رقم الهوية 1111111111 الوكيل خالد بن علي الصفة وكيل الجنسية سعودي رقم الهوية 2222222222",
    agent_name: "",
    agency_clauses: "المرافعة والمطالبة والمحاكم",
  };
  const p = parsePowerRow(row);
  expect(p.wakalahNumber).toBe("381234567890");
  expect(p.issueDate).toBe("1446/03/15");
  expect(p.expiryDate).toBe("1449/03/15");
  expect(p.issuer.name).toContain("عبدالله");
  expect(p.issuer.idNumber).toBe("1111111111");
  expect(p.agent.name).toContain("خالد");
  expect(p.agent.idNumber).toBe("2222222222");
  expect(hasStructuredPower(p)).toBe(true);
});

test("hasStructuredExecution false for near-empty parse", () => {
  const p = parseExecutionRow({ execution_data: "نص لا يحتوي أي مفاتيح معروفة" });
  expect(hasStructuredExecution(p)).toBe(false);
});

test("hasStructuredPower false for near-empty parse", () => {
  const p = parsePowerRow({ issuer_name: "لا شيء هنا" });
  expect(hasStructuredPower(p)).toBe(false);
});

test("prettyFallback inserts newlines around section markers", () => {
  const blob = "المنفذ أحمد المنفذ ضده محمد القرارات إخطار";
  const pretty = prettyFallback(blob, NAJIZ_EXEC_KEYWORDS);
  expect(pretty.split("\n").length).toBeGreaterThan(1);
  expect(pretty).toContain("المنفذ ضده");
  expect(pretty).toContain("القرارات");
});

test("cleanNajizTitle spaces out single-token keywords", () => {
  const t = cleanNajizTitle("شيءالمنفذشيءالجنسيةسعودي");
  expect(t).toContain(" المنفذ");
  expect(t).toContain(" الجنسية");
});

test("wakalah number recovered from noisy field", () => {
  const p = parsePowerRow({
    wakalah_number:
      "abc noise 381234567890 more noise xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  });
  expect(p.wakalahNumber).toBe("381234567890");
});
