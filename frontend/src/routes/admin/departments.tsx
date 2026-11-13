import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CircleDollarSign, Plus } from "lucide-react";
import {
  Badge,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Panel,
  inputCls,
  td,
  th,
  tableWrap,
  tbodyRow,
  theadRow,
} from "@/components/kit";
import { ErrorBlock, LoadingRows } from "@/components/DataState";
import { Button } from "@/components/ui/button";
import {
  addServicePrice,
  createDepartment,
  createService,
  listDepartments,
  listServices,
  managementKeys,
  updateDepartment,
  updateService,
} from "@/lib/api/management";
import { formatKshMinor, titleize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Department, Service } from "@/types/api";

export const Route = createFileRoute("/admin/departments")({
  head: () => ({
    meta: [
      { title: "Departments & Services — MediFlow" },
      { name: "description", content: "Manage departments, services and price lists." },
      { property: "og:title", content: "Departments & Services — MediFlow" },
      {
        property: "og:description",
        content: "Manage departments, services and price lists.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Tab = "departments" | "services";

const blankDepartment = { name: "", code: "", description: "", is_active: true };
const blankService = {
  department_id: "",
  name: "",
  code: "",
  description: "",
  amount: "",
  is_active: true,
};

function Page() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("departments");
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [serviceOpen, setServiceOpen] = useState(false);
  const [priceTarget, setPriceTarget] = useState<Service | null>(null);
  const [departmentForm, setDepartmentForm] = useState(blankDepartment);
  const [serviceForm, setServiceForm] = useState(blankService);
  const [price, setPrice] = useState("");

  const departmentsQuery = useQuery({
    queryKey: managementKeys.departments,
    queryFn: listDepartments,
    staleTime: 120_000,
  });
  const servicesQuery = useQuery({
    queryKey: managementKeys.services({}),
    queryFn: () => listServices({}),
    staleTime: 60_000,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: managementKeys.departments });
    void queryClient.invalidateQueries({ queryKey: ["admin", "services"] });
  };

  const departmentMutation = useMutation({
    mutationFn: () => {
      if (!departmentForm.name || !departmentForm.code) {
        throw new Error("Department name and code are required");
      }
      return createDepartment({
        ...departmentForm,
        description: departmentForm.description || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Department created");
      setDepartmentOpen(false);
      setDepartmentForm(blankDepartment);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const serviceMutation = useMutation({
    mutationFn: () => {
      if (!serviceForm.department_id || !serviceForm.name || !serviceForm.code) {
        throw new Error("Department, service name and code are required");
      }
      if (!serviceForm.amount) throw new Error("Price is required");
      return createService({
        department_id: serviceForm.department_id,
        name: serviceForm.name,
        code: serviceForm.code,
        description: serviceForm.description || undefined,
        is_active: serviceForm.is_active,
        amount_minor: Math.round(Number(serviceForm.amount) * 100),
      });
    },
    onSuccess: () => {
      toast.success("Service created");
      setServiceOpen(false);
      setServiceForm(blankService);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const priceMutation = useMutation({
    mutationFn: () => {
      if (!priceTarget) throw new Error("No service selected");
      if (!price) throw new Error("Price is required");
      return addServicePrice(priceTarget.id, {
        amount_minor: Math.round(Number(price) * 100),
      });
    },
    onSuccess: () => {
      toast.success("Price updated");
      setPriceTarget(null);
      setPrice("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleDepartment = useMutation({
    mutationFn: (department: Department) =>
      updateDepartment(department.id, { is_active: !department.is_active }),
    onSuccess: () => {
      toast.success("Department updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleService = useMutation({
    mutationFn: (service: Service) => updateService(service.id, { is_active: !service.is_active }),
    onSuccess: () => {
      toast.success("Service updated");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const departments = departmentsQuery.data?.items ?? [];
  const services = servicesQuery.data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Departments & Services"
        subtitle="Clinical catalogue and price lists from the live API."
        actions={
          <Button
            onClick={() => (tab === "departments" ? setDepartmentOpen(true) : setServiceOpen(true))}
          >
            <Plus /> {tab === "departments" ? "Add department" : "Add service"}
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {(["departments", "services"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
              tab === value
                ? "bg-primary text-primary-foreground shadow-glow"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {value === "departments" ? (
              <Building2 className="h-4 w-4" />
            ) : (
              <CircleDollarSign className="h-4 w-4" />
            )}
            {titleize(value)}
          </button>
        ))}
      </div>

      {tab === "departments" ? (
        <Panel title="Departments">
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Name</th>
                  <th className={th}>Code</th>
                  <th className={th}>Description</th>
                  <th className={th}>Status</th>
                  <th className={th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {departmentsQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <LoadingRows rows={4} className="p-3" />
                    </td>
                  </tr>
                ) : departmentsQuery.error ? (
                  <tr>
                    <td colSpan={5} className="p-3">
                      <ErrorBlock
                        error={departmentsQuery.error}
                        onRetry={() => void departmentsQuery.refetch()}
                      />
                    </td>
                  </tr>
                ) : departments.length === 0 ? (
                  <EmptyState cols={5} message="No departments yet." />
                ) : (
                  departments.map((department) => (
                    <tr key={department.id} className={tbodyRow}>
                      <td className={cn(td, "font-medium")}>{department.name}</td>
                      <td className={td}>{department.code}</td>
                      <td className={td}>{department.description ?? "—"}</td>
                      <td className={td}>
                        <Badge tone={department.is_active ? "success" : "muted"}>
                          {department.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className={td}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleDepartment.mutate(department)}
                        >
                          {department.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : (
        <Panel title="Services & prices">
          <div className={tableWrap}>
            <table className="w-full">
              <thead>
                <tr className={theadRow}>
                  <th className={th}>Service</th>
                  <th className={th}>Code</th>
                  <th className={th}>Department</th>
                  <th className={th}>Price</th>
                  <th className={th}>Status</th>
                  <th className={th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {servicesQuery.isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-0">
                      <LoadingRows rows={4} className="p-3" />
                    </td>
                  </tr>
                ) : servicesQuery.error ? (
                  <tr>
                    <td colSpan={6} className="p-3">
                      <ErrorBlock
                        error={servicesQuery.error}
                        onRetry={() => void servicesQuery.refetch()}
                      />
                    </td>
                  </tr>
                ) : services.length === 0 ? (
                  <EmptyState cols={6} message="No services yet." />
                ) : (
                  services.map((service) => (
                    <tr key={service.id} className={tbodyRow}>
                      <td className={cn(td, "font-medium")}>{service.name}</td>
                      <td className={td}>{service.code}</td>
                      <td className={td}>
                        {departments.find((item) => item.id === service.department_id)?.name ?? "—"}
                      </td>
                      <td className={td}>{formatKshMinor(service.current_price_minor ?? 0)}</td>
                      <td className={td}>
                        <Badge tone={service.is_active ? "success" : "muted"}>
                          {service.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className={cn(td, "space-x-2")}>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setPriceTarget(service);
                            setPrice(String((service.current_price_minor ?? 0) / 100));
                          }}
                        >
                          Update price
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleService.mutate(service)}
                        >
                          {service.is_active ? "Deactivate" : "Activate"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      <Modal
        open={departmentOpen}
        onClose={() => setDepartmentOpen(false)}
        title="Add department"
        footer={
          <>
            <Button variant="outline" onClick={() => setDepartmentOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => departmentMutation.mutate()}
              disabled={departmentMutation.isPending}
            >
              {departmentMutation.isPending ? "Saving…" : "Create department"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={inputCls}
              value={departmentForm.name}
              onChange={(event) =>
                setDepartmentForm({ ...departmentForm, name: event.target.value })
              }
            />
          </Field>
          <Field label="Code">
            <input
              className={inputCls}
              value={departmentForm.code}
              onChange={(event) =>
                setDepartmentForm({ ...departmentForm, code: event.target.value })
              }
            />
          </Field>
          <Field label="Description">
            <input
              className={inputCls}
              value={departmentForm.description}
              onChange={(event) =>
                setDepartmentForm({ ...departmentForm, description: event.target.value })
              }
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={serviceOpen}
        onClose={() => setServiceOpen(false)}
        title="Add service"
        footer={
          <>
            <Button variant="outline" onClick={() => setServiceOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => serviceMutation.mutate()} disabled={serviceMutation.isPending}>
              {serviceMutation.isPending ? "Saving…" : "Create service"}
            </Button>
          </>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Department">
            <select
              className={inputCls}
              value={serviceForm.department_id}
              onChange={(event) =>
                setServiceForm({ ...serviceForm, department_id: event.target.value })
              }
            >
              <option value="">Select department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input
              className={inputCls}
              value={serviceForm.name}
              onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })}
            />
          </Field>
          <Field label="Code">
            <input
              className={inputCls}
              value={serviceForm.code}
              onChange={(event) => setServiceForm({ ...serviceForm, code: event.target.value })}
            />
          </Field>
          <Field label="Price (KES)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputCls}
              value={serviceForm.amount}
              onChange={(event) => setServiceForm({ ...serviceForm, amount: event.target.value })}
            />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <input
              className={inputCls}
              value={serviceForm.description}
              onChange={(event) =>
                setServiceForm({ ...serviceForm, description: event.target.value })
              }
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(priceTarget)}
        onClose={() => setPriceTarget(null)}
        title="Update price"
        subtitle={priceTarget?.name}
        footer={
          <>
            <Button variant="outline" onClick={() => setPriceTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => priceMutation.mutate()} disabled={priceMutation.isPending}>
              {priceMutation.isPending ? "Saving…" : "Save price"}
            </Button>
          </>
        }
      >
        <Field label="New price (KES)">
          <input
            type="number"
            min="0"
            step="0.01"
            className={inputCls}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
          />
        </Field>
      </Modal>
    </div>
  );
}
