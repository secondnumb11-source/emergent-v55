import { useState } from "react";
import { toast } from "sonner";
import { Plus, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABEL } from "@/lib/cases-view";

interface AddCaseDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: any[];
  onCreate: (payload: Record<string, unknown>) => Promise<unknown> | unknown;
}

const initialForm = () => ({
  case_number: "",
  title: "",
  court: "",
  circuit_number: "",
  plaintiff_name: "",
  defendant_name: "",
  client_id: "",
  status: "open",
  case_classification: "",
  case_type: "",
  description: "",
});

export function AddCaseDialog({ open, onOpenChange, clients, onCreate }: AddCaseDialogProps) {
  const [form, setForm] = useState<ReturnType<typeof initialForm>>(initialForm());
  const reset = () => setForm(initialForm());
  const submit = async () => {
    if (!form.case_number.trim()) return toast.error("رقم القضية مطلوب");
    const payload: Record<string, unknown> = { ...form };
    if (!payload.client_id) delete payload.client_id;
    if (!form.title.trim()) payload.title = `قضية ${form.case_number}`;
    await onCreate(payload);
    reset();
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-black text-[#1f1810]">
            <Plus className="h-5 w-5 inline text-[#8a6a1a] ml-1" /> إضافة قضية يدوياً
          </DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Field
            label="رقم القضية *"
            value={form.case_number}
            onChange={(x) => setForm({ ...form, case_number: x })}
          />
          <Field
            label="عنوان القضية"
            value={form.title}
            onChange={(x) => setForm({ ...form, title: x })}
          />
          <div>
            <Label className="text-[11px] font-black text-[#5a4510]">ربط عميل</Label>
            <Select
              value={form.client_id || "__none__"}
              onValueChange={(x) => setForm({ ...form, client_id: x === "__none__" ? "" : x })}
            >
              <SelectTrigger className="h-9 mt-1">
                <SelectValue placeholder="بدون عميل" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— بدون ربط —</SelectItem>
                {clients.map((cl: any) => (
                  <SelectItem key={cl.id} value={cl.id}>
                    {cl.name || cl.full_name || cl.company_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] font-black text-[#5a4510]">الحالة</Label>
            <Select value={form.status} onValueChange={(x) => setForm({ ...form, status: x })}>
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            label="تصنيف القضية"
            value={form.case_classification}
            onChange={(x) => setForm({ ...form, case_classification: x })}
          />
          <Field
            label="نوع القضية"
            value={form.case_type}
            onChange={(x) => setForm({ ...form, case_type: x })}
          />
          <Field
            label="اسم المدعي"
            value={form.plaintiff_name}
            onChange={(x) => setForm({ ...form, plaintiff_name: x })}
          />
          <Field
            label="اسم المدعى عليه"
            value={form.defendant_name}
            onChange={(x) => setForm({ ...form, defendant_name: x })}
          />
          <Field
            label="المحكمة"
            value={form.court}
            onChange={(x) => setForm({ ...form, court: x })}
          />
          <Field
            label="رقم الدائرة"
            value={form.circuit_number}
            onChange={(x) => setForm({ ...form, circuit_number: x })}
          />
          <div className="col-span-2">
            <Label className="text-[11px] font-black text-[#5a4510]">ملاحظات / وصف</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="min-h-[70px] mt-1"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <Button className="rounded-full bg-[#8a6a1a] hover:bg-[#6d5415]" onClick={submit}>
            <Save className="h-4 w-4 ml-1" /> حفظ القضية
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-[11px] font-black text-[#5a4510]">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-9 mt-1" />
    </div>
  );
}
