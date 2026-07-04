// Test the new Najiz parsing engine against REAL DB samples.
import { parsePowerRow, parseExecutionRow, cleanNajizTitle } from "../src/lib/najiz-display";
import { pickField, pickFirst, parseBlob, looksLikeBlob, extractCaseNumber } from "../src/lib/najiz-parse";

let pass = 0, fail = 0;
function check(name: string, actual: any, expectedContains: string | null) {
  const ok = expectedContains === null
    ? actual == null || actual === "" || actual === undefined
    : typeof actual === "string" && actual.includes(expectedContains);
  if (ok) { pass++; console.log(`  PASS ${name} => ${JSON.stringify(actual)?.slice(0, 90)}`); }
  else { fail++; console.log(`  FAIL ${name} => ${JSON.stringify(actual)?.slice(0, 160)} (expected contains ${JSON.stringify(expectedContains)})`); }
}

console.log("== 1. POWER OF ATTORNEY (real glued row) ==");
const poaRow = {
  wakalah_number: "جهةالإصدارخدماتالوكالاتالإلكترونيةكيفيةالاستخدامغيرمجتمعينتاريخإصدارالوكالة1445/08/22هـ(2024/03/03م)تاريخانتهاءالوكالة1446/08/22هـ(2025/02/21م)",
  issuer_name: "( 1 ) شادى صلاح سعد عبدالوهاب الصفة أصالة عن نفسه الجنسية مصري نوع الهوية إقامة رقم الهوية 2506919980 حالته بالوكالة غير سارية بيانات الوكيل ( 1 ) معتز صلاح سعد عبدالوهاب الصفة أصا",
  agent_name: "( 1 ) معتز صلاح سعد عبدالوهاب الصفة أصالة عن نفسة الجنسية مصري نوع الهوية إقامة رقم الهوية 2384943292 حالته بالوكالة غير سارية بنود الوكالة المطالبات والمحاكم المطالبة وإقامة الدعا",
  issue_date: "2024-03-03",
  expiry_date: "2025-02-21",
  status: "expired",
  najiz_id: "power_test_blob_2",
  issuer_entity: "كيفية الاستخدام غير مجتمعين",
};
const poa = parsePowerRow(poaRow);
check("issuerEntity", poa.issuerEntity, "خدمات الوكالات الإلكترونية");
check("usageMethod", poa.usageMethod, "غير مجتمعين");
check("issuer.name", poa.issuer.name, "شادى صلاح سعد عبدالوهاب");
check("issuer.capacity", poa.issuer.capacity, "أصالة عن نفسه");
check("issuer.nationality", poa.issuer.nationality, "مصري");
check("issuer.idType", poa.issuer.idType, "إقامة");
check("issuer.idNumber", poa.issuer.idNumber, "2506919980");
check("issuer.status", poa.issuer.status, "غير سارية");
check("agent.name", poa.agent.name, "معتز صلاح سعد عبدالوهاب");
check("agent.idNumber", poa.agent.idNumber, "2384943292");
check("agent.status", poa.agent.status, "غير سارية");
check("agencyClauses", poa.agencyClauses, "المطالبات والمحاكم");
console.log("  wakalahNumber:", poa.wakalahNumber, "(should be undefined or numeric, NOT blob)");
if (poa.wakalahNumber && poa.wakalahNumber.length > 30) { fail++; console.log("  FAIL wakalahNumber is a blob"); } else pass++;
check("issueDate", poa.issueDate, "2024-03-03");

console.log("\n== 2. POA row 2 (partial) ==");
const poa2 = parsePowerRow({
  wakalah_number: "465627636",
  agent_name: "هيام علي احمد الطيب حالة الوكالة مفسوخة كلياً إعادة إصدار ال",
  status: "active", najiz_id: "power_465627636",
});
check("wakalahNumber2", poa2.wakalahNumber, "465627636");
check("agent2.name", poa2.agent.name, "هيام علي احمد الطيب");
check("agent2.status", poa2.agent.status, "مفسوخة كلياً");

console.log("\n== 3. EXECUTION (real row) ==");
const execRow = {
  execution_number: "401014502104732",
  court: "محكمة التنفيذ بالرياض",
  amount: 2999.0,
  debtor_name: "شادى صلاح سعد عبدالوهاب عرض التفاصيل الصفة فرد نوع الهوية هوية مقيم رقم الهوية 2506919980 الجنسية مصري القرارات (2) إظهار الكل تقديم خدمة على طلب التنفيذ عزيزي المستفيد",
  creditor_name: "شركة الاتصالات المتنقلة السعودية (زين) - المبلغ المستحق (1934) عرض التفاصيل الصفة شركة مسجلة في وزارة التجارة نوع الهوية سجل تجاري رقم الهوية 1010246192 الرقم الموحد 7001550727 المنفذ ضده : شادى صلاح",
  creditor_id_number: "1084571692", debtor_id_number: "1010246192",
  request_type: "منفذ ضده",
  execution_data: "الصفة في الطلب\nمنفذ ضده\nنوع السند الرئيسي\nمالي - أوراق تجارية إلكترونية\nنوع السند الفرعي\nسند لأمر إلكتروني\nالمحكمة\nمحكمة التنفيذ بالرياض\nالدائرة\nدائرة التنفيذ السادسة والثلاثون\nتاريخ تقديم الطلب\n1445/11/6هـ\nحالة الطلب\nقيد التنفيذ\nحالة الطلب لا تعكس حالة الصرف على مستوى الطلب و يمكنك استعراض حالة الصرف من خلال المحفظة الرقمية.\nيمكنك متابعة حالة رفع الاجراءات مع الجهات من خلال استعراض تبويب القرارات.",
  circuit_number: "دائرة التنفيذ السادسة والثلاثون",
  filed_date: "2024-05-14",
};
const ex = parseExecutionRow(execRow);
check("court", ex.court, "محكمة التنفيذ بالرياض");
check("circuit", ex.circuit, "دائرة التنفيذ السادسة والثلاثون");
check("bondMain", ex.bondMain, "مالي - أوراق تجارية إلكترونية");
check("bondSub", ex.bondSub, "سند لأمر إلكتروني");
check("requestStatus", ex.requestStatus, "قيد التنفيذ");
check("debtor.name", ex.debtor.name, "شادى صلاح سعد عبدالوهاب");
check("debtor.capacity", ex.debtor.capacity, "فرد");
check("debtor.idType", ex.debtor.idType, "هوية مقيم");
check("debtor.idNumber", ex.debtor.idNumber, "2506919980");
check("debtor.nationality", ex.debtor.nationality, "مصري");
check("creditor.name", ex.creditor.name, "شركة الاتصالات المتنقلة السعودية (زين)");
check("creditor.idType", ex.creditor.idType, "سجل تجاري");
check("creditor.idNumber", ex.creditor.idNumber, "1010246192");
check("creditor.unifiedNumber", ex.creditor.unifiedNumber, "7001550727");
check("creditor.amountDue", ex.creditor.amountDue, "1934");
if (ex.debtor.name?.includes("عرض التفاصيل") || ex.debtor.name?.includes("عزيزي")) { fail++; console.log("  FAIL junk in debtor name"); } else { pass++; console.log("  PASS no junk in debtor name"); }

console.log("\n== 4. CASE DETAILS blobs (real rows) ==");
// value-first blob: own value leads, then rest of page
check("classification value-first",
  pickField("العمالة العادية نوع القضية إنهاء العلاقة العمالية من صاحب العمل تاريخ القضية 2 ر", "classification"),
  "العمالة العادية");
check("type value-first",
  pickField("إنهاء العلاقة العمالية من صاحب العمل تاريخ القضية 2 ربيع الأول موضوع الدعوى مذكر", "type"),
  "إنهاء العلاقة العمالية من صاحب العمل");
// glued case number
check("extractCaseNumber", extractCaseNumber("4570242787تصنيفالقضيةالعمالةالعاديةنوعالقضيةإنهاءالعلاقةالعماليةمنصاحبالعملتاريخ"), "4570242787");
check("extractCaseNumber clean", extractCaseNumber("4570242787"), "4570242787");
// junk-only subject должен be dropped
const junkSubject = pickField("مذكرة الدفاع الأولى أطراف الدعوى الجلسات الأحكام الطلبات الإجراءات القرارات التك", "subject");
console.log("  junk-only subject =>", JSON.stringify(junkSubject));
if (!junkSubject || junkSubject.length < 15) { pass++; console.log("  PASS junk subject suppressed"); } else { fail++; console.log("  FAIL junk subject leaked:", junkSubject); }
// real subject preserved
check("real subject", pickField("ارغب في التقدم اليكم بطلب لرفع الظلم والضرر الواقع علي بسبب تعمد صاحب العمل مخال", "subject"), "ارغب في التقدم");

console.log("\n== 5. FULL GLUED case blob parse ==");
const glued = "4570242787تصنيفالقضيةالعمالةالعاديةنوعالقضيةإنهاءالعلاقةالعماليةمنصاحبالعملتاريخالقضية2ربيعالأولموضوعالدعوىمذكرةالدفاعالأولىأطرافالدعوىالجلساتالأحكامالطلباتالإجراءاتالقراراتالتكاليفالقضائيةالمرفقاتموضوعالدعوى:إنني اعمل لدي المدعى عليها";
console.log("  looksLikeBlob:", looksLikeBlob(glued));
const parsed = parseBlob(glued);
console.log("  parsed keys:", Object.keys(parsed));
check("glued classification", parsed.classification, "العمالة العادية");
check("glued type", parsed.type, "إنهاء العلاقة العمالية");
check("glued subject", parsed.subject, "إنني");

console.log("\n== 6. session bleed values ==");
check("session status cut", pickField("منتهية المحكمة المحكمة العامة بالرياض ال", "sessionStatus") ?? pickField("منتهية المحكمة المحكمة العامة بالرياض ال", "status"), "منتهية");
check("court from bleed", pickField("المحكمة العامة بالرياض الدائرة الدائرة العامة السابعة والأرب", "court"), "المحكمة العامة بالرياض");

console.log("\n== 7. cleanNajizTitle on glued header ==");
const t = cleanNajizTitle("جهةالإصدارخدماتالوكالاتالإلكترونيةكيفيةالاستخدامغيرمجتمعينتاريخإصدارالوكالة1446/10/23هـ(2025/04/21م)");
console.log("  =>", t);
if (t.includes("جهة الإصدار") && t.includes("كيفية الاستخدام")) { pass++; console.log("  PASS title de-glued"); } else { fail++; console.log("  FAIL title still glued"); }

console.log(`\n===== RESULT: ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
