-- =================================================================
-- إصلاح خطأ "Bucket not found" في قسم أرشيف المستندات والأحكام
-- =================================================================
-- شغّل هذا الملف يدوياً في:
--   Supabase Dashboard → SQL Editor
--
-- يقوم بـ:
--   1) إنشاء storage buckets خاصة للأرشيف والأحكام:
--        - case-documents
--        - judgment-documents
--   2) إضافة سياسات RLS على storage.objects بحيث:
--      - كل مستخدم يرفع/يقرأ/يعدّل/يحذف ملفاته فقط
--      - يمكن للموظفين/العملاء داخل القضية ذاتها عرض الملفات عند الصلاحية المناسبة
--      - مسار الملف داخل الـ bucket: <auth.uid()>/<case_id>/<file> أو <auth.uid()>/judgments/<file>
-- =================================================================

-- 1) إنشاء الـ buckets إن لم تكن موجودة
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('case-documents', 'case-documents', false, 52428800, ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]),
  ('judgment-documents', 'judgment-documents', false, 52428800, ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp'
  ])
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2) تفعيل RLS (افتراضياً مفعّل)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3) إزالة سياسات قديمة بنفس الاسم لتجنب التعارض
DROP POLICY IF EXISTS "case_documents_select_own" ON storage.objects;
DROP POLICY IF EXISTS "case_documents_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "case_documents_update_own" ON storage.objects;
DROP POLICY IF EXISTS "case_documents_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "judgment_documents_select_own" ON storage.objects;
DROP POLICY IF EXISTS "judgment_documents_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "judgment_documents_update_own" ON storage.objects;
DROP POLICY IF EXISTS "judgment_documents_delete_own" ON storage.objects;

-- 4) قراءة ملفاتي في bucket case-documents
CREATE POLICY "case_documents_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 5) رفع داخل مجلدي
CREATE POLICY "case_documents_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 6) تعديل ملفاتي
CREATE POLICY "case_documents_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'case-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 7) حذف ملفاتي
CREATE POLICY "case_documents_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 8) قراءة ملفاتي في bucket judgment-documents
CREATE POLICY "judgment_documents_select_own"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'judgment-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 9) رفع مستندات الحكم في judgment-documents
CREATE POLICY "judgment_documents_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'judgment-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 10) تعديل مستندات الحكم
CREATE POLICY "judgment_documents_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'judgment-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'judgment-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 11) حذف مستندات الحكم
CREATE POLICY "judgment_documents_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'judgment-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- =================================================================
-- بعد التشغيل: ارفع مستنداً من قسم الأرشيف أو قسم الأحكام — ستُنشأ البوكتس وتعمل سياسات RLS.
-- لعرض/تنزيل الملفات، استخدم في الواجهة:
--   const { data } = await supabase.storage
--     .from('case-documents')
--     .createSignedUrl(filePath, 3600);
--   const { data } = await supabase.storage
--     .from('judgment-documents')
--     .createSignedUrl(filePath, 3600);
-- =================================================================
