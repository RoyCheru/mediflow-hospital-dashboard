import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Building2,
  BedDouble,
  Activity,
  Clock,
  Plus,
  Pencil,
  Tag,
  Stethoscope,
} from "lucide-react";
import {
  Badge,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  StatCard,
  inputCls,
  textareaCls,
  th,
  td,
  tableWrap,
  theadRow,
  tbodyRow,
} from "@/components/kit";
import {
  departmentRecords as seedDepartments,
  ksh,
  services as seedServices,
  titleize,
  type Department,
  type Service,
} from "@/lib/data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/departments")({
  head: () => ({
    meta: [
      { title: "Departments & Services — MediFlow" },
      {
        name: "description",
        content: "Department capacity, service catalog and effective-dated pricing.",
      },
      { property: "og:title", content: "Departments & Services — MediFlow" },
      {
        property: "og:description",
        content: "Department capacity, service catalog and effective-dated pricing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "departments" | "services";
const blankDept = { name: "", code: "", description: "", active: true };
const blankService = {
  department: "Outpatient",
  name: "",
  code: "",
  description: "",
  price: "0",
  active: true,
};

function Page() {
  const [tab, setTab] = useState<Tab>("departments");
  const [depts, setDepts] = useState<Department[]>(seedDepartments);
  const [svc, setSvc] = useState<Service[]>(seedServices);
  const [modal, setModal] = useState<
    null | "dept" | "deptEdit" | "service" | "serviceEdit" | "price"
  >(null);
  const [targetDept, setTargetDept] = useState<Department | null>(null);
  const [targetService, setTargetService] = useState<Service | null>(null);
  const [deptForm, setDeptForm] = useState(blankDept);
  const [serviceForm, setServiceForm] = useState(blankService);
  const [priceForm, setPriceForm] = useState({ amount: "0", effectiveFrom: "2026-10-29" });

  const beds = depts.reduce((a, d) => a + d.beds, 0);
  const used = depts.reduce((a, d) => a + d.used, 0);

  const createDept = () => {
    if (!deptForm.name.trim() || !deptForm.code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setDepts((d) => [
      ...d,
      {
        id: `dep-${d.length + 1}`,
        name: deptForm.name,
        code: deptForm.code,
        description: deptForm.description,
        active: deptForm.active,
        head: "Unassigned",
        beds: 0,
        used: 0,
        staff: 0,
        revenue: 0,
        wait: 0,
      },
    ]);
    setModal(null);
    setDeptForm(blankDept);
    toast.success("Department created");
  };

  const saveDept = () => {
    if (!targetDept) return;
    setDepts((d) =>
      d.map((x) =>
        x.id === targetDept.id
          ? {
              ...x,
              name: deptForm.name,
              description: deptForm.description,
              active: deptForm.active,
            }
          : x,
      ),
    );
    setModal(null);
    toast.success("Department updated");
  };

  const createService = () => {
    if (!serviceForm.name.trim() || !serviceForm.code.trim()) {
      toast.error("Name and code are required");
      return;
    }
    setSvc((s) => [
      ...s,
      {
        id: `svc-${s.length + 1}`,
        department: serviceForm.department,
        name: serviceForm.name,
        code: serviceForm.code,
        description: serviceForm.description,
        price: Number(serviceForm.price) || 0,
        active: serviceForm.active,
        priceHistory: [{ amount: Number(serviceForm.price) || 0, effectiveFrom: "2026-10-29" }],
      },
    ]);
    setModal(null);
    setServiceForm(blankService);
    toast.success("Service created");
  };

  const saveService = () => {
    if (!targetService) return;
    setSvc((s) =>
      s.map((x) =>
        x.id === targetService.id
          ? {
              ...x,
              name: serviceForm.name,
              description: serviceForm.description,
              active: serviceForm.active,
            }
          : x,
      ),
    );
    setModal(null);
    toast.success("Service updated");
  };

  const updatePrice = () => {
    if (!targetService) return;
    const amount = Number(priceForm.amount) || 0;
    setSvc((s) =>
      s.map((x) =>
        x.id === targetService.id
          ? {
              ...x,
              price: amount,
              priceHistory: [{ amount, effectiveFrom: priceForm.effectiveFrom }, ...x.priceHistory],
            }
          : x,
      ),
    );
    setModal(null);
    toast.success("New price effective from " + priceForm.effectiveFrom);
  };

  return (
    <div>
      <PageHeader
        title="Departments & Services"
        subtitle="Department capacity, service catalog and effective-dated pricing."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setDeptForm(blankDept);
                setModal("dept");
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-primary px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" />
              Department
            </button>
            <button
              onClick={() => {
                setServiceForm(blankService);
                setModal("service");
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
              Service
            </button>
          </div>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          icon={Building2}
          label="Departments"
          value={String(depts.length)}
          change={0}
        />
        <StatCard
          tone="yellow"
          icon={BedDouble}
          label="Bed Occupancy"
          value={`${Math.round((used / Math.max(1, beds)) * 100)}%`}
          change={3.8}
        />
        <StatCard tone="pink" icon={Activity} label="Admissions Today" value="37" change={6.5} />
        <StatCard tone="purple" icon={Clock} label="Avg. Wait" value="21 min" change={-4.2} />
      </div>

      <Panel>
        <div className="flex overflow-x-auto rounded-xl bg-secondary p-1">
          {(
            [
              ["departments", "Departments"],
              ["services", "Service catalog"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cn(
                "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition",
                tab === id
                  ? "bg-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "departments" && (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {depts.map((d) => {
              const pct = d.beds ? Math.round((d.used / d.beds) * 100) : 0;
              const bar = pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-success";
              return (
                <div key={d.id} className="rounded-2xl border border-border bg-secondary/40 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-grad-teal text-on-gradient">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{d.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d.code} · Head: {d.head}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setTargetDept(d);
                        setDeptForm({
                          name: d.name,
                          code: d.code,
                          description: d.description,
                          active: d.active,
                        });
                        setModal("deptEdit");
                      }}
                      aria-label="Edit department"
                      className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-muted-foreground">Bed occupancy</span>
                      <span className="font-semibold">
                        {d.beds ? `${d.used}/${d.beds} · ${pct}%` : "Day service"}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-xl bg-card p-2.5">
                      <p className="text-muted-foreground">Staff</p>
                      <p className="mt-0.5 font-semibold">{d.staff}</p>
                    </div>
                    <div className="rounded-xl bg-card p-2.5">
                      <p className="text-muted-foreground">Wait</p>
                      <p className="mt-0.5 font-semibold">{d.wait} min</p>
                    </div>
                    <div className="rounded-xl bg-card p-2.5">
                      <p className="text-muted-foreground">Oct revenue</p>
                      <p className="mt-0.5 font-semibold">{ksh(d.revenue / 1000)}K</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <Badge tone={d.active ? "success" : "muted"}>
                      {d.active ? "Active" : "Inactive"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {svc.filter((s) => s.department === d.name).length} services
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "services" && (
          <div className={cn(tableWrap, "mt-5")}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  {[
                    "Service",
                    "Department",
                    "Code",
                    "Current price",
                    "Prices",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {svc.map((s) => (
                  <tr key={s.id} className={tbodyRow}>
                    <td className={td}>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.description}</div>
                    </td>
                    <td className={td}>{s.department}</td>
                    <td className={cn(td, "font-mono text-xs")}>{s.code}</td>
                    <td className={cn(td, "font-semibold")}>{ksh(s.price)}</td>
                    <td className={td}>
                      <span className="text-xs text-muted-foreground">
                        {s.priceHistory.length} effective-dated
                      </span>
                    </td>
                    <td className={td}>
                      <Badge tone={s.active ? "success" : "muted"}>
                        {s.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className={td}>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            setTargetService(s);
                            setServiceForm({
                              department: s.department,
                              name: s.name,
                              code: s.code,
                              description: s.description,
                              price: String(s.price),
                              active: s.active,
                            });
                            setModal("serviceEdit");
                          }}
                          aria-label="Edit service"
                          title="Edit service"
                          className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => {
                            setTargetService(s);
                            setPriceForm({ amount: String(s.price), effectiveFrom: "2026-10-29" });
                            setModal("price");
                          }}
                          aria-label="Update price"
                          title="Update price"
                          className="rounded-lg p-2 text-primary hover:bg-primary/15"
                        >
                          <Tag className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {svc.length === 0 && <EmptyState cols={7} />}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Modal
        open={modal === "dept" || modal === "deptEdit"}
        onClose={() => setModal(null)}
        title={modal === "dept" ? "Create department" : "Edit department"}
        subtitle={modal === "dept" ? "POST /admin/departments" : "PATCH /admin/departments/:id"}
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={modal === "dept" ? createDept : saveDept}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {modal === "dept" ? "Create" : "Save"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              className={inputCls}
              value={deptForm.name}
              onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
            />
          </Field>
          <Field label="Code">
            <input
              className={inputCls}
              value={deptForm.code}
              onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
              disabled={modal === "deptEdit"}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea
              className={textareaCls}
              value={deptForm.description}
              onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={deptForm.active}
              onChange={(e) => setDeptForm({ ...deptForm, active: e.target.checked })}
            />
            Active
          </label>
        </div>
      </Modal>

      <Modal
        open={modal === "service" || modal === "serviceEdit"}
        onClose={() => setModal(null)}
        wide
        title={modal === "service" ? "Create service" : "Edit service"}
        subtitle={modal === "service" ? "POST /admin/services" : "PATCH /admin/services/:id"}
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={modal === "service" ? createService : saveService}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              {modal === "service" ? "Create" : "Save"}
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Department">
            <select
              className={inputCls}
              value={serviceForm.department}
              onChange={(e) => setServiceForm({ ...serviceForm, department: e.target.value })}
              disabled={modal === "serviceEdit"}
            >
              {depts.map((d) => (
                <option key={d.id}>{d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input
              className={inputCls}
              value={serviceForm.name}
              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
            />
          </Field>
          <Field label="Code">
            <input
              className={inputCls}
              value={serviceForm.code}
              onChange={(e) => setServiceForm({ ...serviceForm, code: e.target.value })}
              disabled={modal === "serviceEdit"}
            />
          </Field>
          <Field label="Price (KSh)">
            <input
              type="number"
              className={inputCls}
              value={serviceForm.price}
              onChange={(e) => setServiceForm({ ...serviceForm, price: e.target.value })}
              disabled={modal === "serviceEdit"}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea
              className={textareaCls}
              value={serviceForm.description}
              onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={serviceForm.active}
              onChange={(e) => setServiceForm({ ...serviceForm, active: e.target.checked })}
            />
            Active
          </label>
        </div>
      </Modal>

      <Modal
        open={modal === "price"}
        onClose={() => setModal(null)}
        title="Update service price"
        subtitle={
          targetService
            ? `${targetService.name} · POST /admin/services/${targetService.id}/prices`
            : undefined
        }
        footer={
          <>
            <button
              onClick={() => setModal(null)}
              className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={updatePrice}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Publish price
            </button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (KSh)">
            <input
              type="number"
              className={inputCls}
              value={priceForm.amount}
              onChange={(e) => setPriceForm({ ...priceForm, amount: e.target.value })}
            />
          </Field>
          <Field label="Effective from">
            <input
              type="date"
              className={inputCls}
              value={priceForm.effectiveFrom}
              onChange={(e) => setPriceForm({ ...priceForm, effectiveFrom: e.target.value })}
            />
          </Field>
        </div>
        {targetService && (
          <div className="mt-4 rounded-xl bg-secondary p-3">
            <p className="text-xs text-muted-foreground">Price history</p>
            <ul className="mt-1 space-y-1 text-xs">
              {targetService.priceHistory.map((p) => (
                <li key={p.effectiveFrom} className="flex justify-between">
                  <span>{p.effectiveFrom}</span>
                  <span className="font-semibold">{ksh(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          <Stethoscope className="mr-1 inline h-3.5 w-3.5" />
          Previous price is closed automatically when a new price is published.
        </p>
      </Modal>
    </div>
  );
}
