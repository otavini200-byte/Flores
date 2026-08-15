import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Package,
  Boxes,
  Tag,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import api, { brl } from "../lib/apiClient";
import { StatusBadge, STATUS_META } from "./Orders";

const EMPTY = {
  name: "",
  description: "",
  price: "",
  image_url: "",
  category: "Geral",
  stock: "",
  on_promotion: false,
  discount_percent: 0,
};

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5" data-testid={`stat-${label}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${accent || ""}`} />
        <span className="text-xs uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <p className="mt-2 font-display font-black text-2xl">{value}</p>
    </div>
  );
}

export default function Admin() {
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);

  const loadProducts = () => api.get("/products").then(({ data }) => setProducts(data));
  const loadOrders = () => api.get("/orders").then(({ data }) => setOrders(data));

  useEffect(() => {
    loadProducts();
    loadOrders();
  }, []);

  const lowStock = useMemo(() => products.filter((p) => p.stock === 1), [products]);

  useEffect(() => {
    if (lowStock.length > 0) {
      toast.warning(
        `${lowStock.length} produto(s) com apenas 1 unidade em estoque!`,
        { id: "low-stock-alert", duration: 6000 }
      );
    }
  }, [lowStock.length]);

  const openCreate = () => {
    setForm(EMPTY);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (p) => {
    setForm({ ...p });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      name: form.name,
      description: form.description,
      price: parseFloat(form.price) || 0,
      image_url: form.image_url,
      category: form.category || "Geral",
      stock: parseInt(form.stock) || 0,
      on_promotion: !!form.on_promotion,
      discount_percent: parseInt(form.discount_percent) || 0,
    };
    try {
      if (editingId) {
        await api.put(`/products/${editingId}`, payload);
        toast.success("Produto atualizado");
      } else {
        await api.post("/products", payload);
        toast.success("Produto criado");
      }
      setDialogOpen(false);
      loadProducts();
    } catch (e) {
      toast.error("Erro ao salvar produto");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await api.delete(`/products/${deleteId}`);
      toast.success("Produto removido");
      loadProducts();
    } catch {
      toast.error("Erro ao remover");
    } finally {
      setDeleteId(null);
    }
  };

  const changeStatus = async (orderId, status) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status });
      toast.success("Status atualizado");
      loadOrders();
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  const revenue = orders
    .filter((o) => o.status !== "cancelado")
    .reduce((s, o) => s + o.total, 0);

  return (
    <main className="pt-24 pb-20 max-w-7xl mx-auto px-6" data-testid="admin-page">
      <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter">
        Painel do Administrador
      </h1>
      <p className="mt-2 text-muted-foreground">Gerencie produtos, estoque, promoções e pedidos.</p>

      {/* Low stock banner */}
      {lowStock.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3 animate-pulse-alert"
          data-testid="low-stock-banner"
        >
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-red-600">Alerta de estoque baixo</p>
            <p className="text-sm text-red-600/80">
              {lowStock.map((p) => p.name).join(", ")} — apenas 1 unidade restante.
            </p>
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Boxes} label="Produtos" value={products.length} />
        <StatCard icon={Package} label="Pedidos" value={orders.length} />
        <StatCard
          icon={AlertTriangle}
          label="Estoque baixo"
          value={lowStock.length}
          accent={lowStock.length ? "text-red-500" : ""}
        />
        <StatCard icon={TrendingUp} label="Faturamento" value={brl(revenue)} />
      </div>

      <Tabs defaultValue="products" className="mt-8">
        <TabsList className="rounded-full">
          <TabsTrigger value="products" className="rounded-full" data-testid="tab-products">
            Produtos
          </TabsTrigger>
          <TabsTrigger value="orders" className="rounded-full" data-testid="tab-orders">
            Pedidos
          </TabsTrigger>
        </TabsList>

        {/* Products */}
        <TabsContent value="products" className="mt-6">
          <div className="flex justify-end mb-4">
            <Button onClick={openCreate} className="rounded-full" data-testid="new-product-btn">
              <Plus className="h-4 w-4 mr-1" /> Novo produto
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col"
                data-testid={`admin-product-${p.id}`}
              >
                <div className="flex gap-3 p-4">
                  <img src={p.image_url} alt={p.name} className="h-16 w-16 rounded-xl object-cover border border-border" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                    <p className="mt-1 font-display font-bold">{brl(p.price)}</p>
                  </div>
                </div>
                <div className="px-4 pb-4 mt-auto flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold rounded-full px-2.5 py-1 border ${
                        p.stock === 1
                          ? "bg-red-500/10 text-red-600 border-red-500/20 animate-pulse-alert"
                          : p.stock === 0
                          ? "bg-muted text-muted-foreground border-border"
                          : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      }`}
                      data-testid={`admin-stock-${p.id}`}
                    >
                      {p.stock} un.
                    </span>
                    {p.on_promotion && p.discount_percent > 0 && (
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-indigo-600 text-white flex items-center gap-1">
                        <Tag className="h-3 w-3" /> -{p.discount_percent}%
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => openEdit(p)} data-testid={`edit-product-${p.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full text-red-500 hover:text-red-600" onClick={() => setDeleteId(p.id)} data-testid={`delete-product-${p.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* Orders */}
        <TabsContent value="orders" className="mt-6">
          {orders.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center">Nenhum pedido ainda.</p>
          ) : (
            <div className="space-y-4">
              {orders.map((o) => (
                <div key={o.id} className="rounded-2xl border border-border bg-card p-5" data-testid={`admin-order-${o.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-display font-bold">Pedido #{o.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">
                        {o.user_name} · {o.user_email}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={o.status} />
                      <Select value={o.status} onValueChange={(v) => changeStatus(o.id, v)}>
                        <SelectTrigger className="w-40 rounded-full" data-testid={`order-status-select-${o.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.keys(STATUS_META).map((s) => (
                            <SelectItem key={s} value={s}>
                              {STATUS_META[s].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {o.items.map((it) => (
                      <span key={it.product_id} className="text-xs bg-muted rounded-full px-3 py-1">
                        {it.quantity}× {it.name}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 font-display font-bold">Total: {brl(o.total)}</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Product dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="product-dialog">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl tracking-tight">
              {editingId ? "Editar produto" : "Novo produto"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="form-name" />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="form-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preço (R$)</Label>
                <Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="form-price" />
              </div>
              <div className="space-y-2">
                <Label>Estoque</Label>
                <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} data-testid="form-stock" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="form-category" />
            </div>
            <div className="space-y-2">
              <Label>URL da imagem</Label>
              <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} data-testid="form-image" />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-4">
              <div>
                <Label>Em promoção</Label>
                <p className="text-xs text-muted-foreground">Ative para aplicar desconto</p>
              </div>
              <Switch checked={form.on_promotion} onCheckedChange={(v) => setForm({ ...form, on_promotion: v })} data-testid="form-promo-switch" />
            </div>
            {form.on_promotion && (
              <div className="space-y-2">
                <Label>Desconto (%)</Label>
                <Input type="number" min="0" max="100" value={form.discount_percent} onChange={(e) => setForm({ ...form, discount_percent: e.target.value })} data-testid="form-discount" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button className="rounded-full" onClick={save} disabled={saving || !form.name} data-testid="save-product-btn">
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent data-testid="delete-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover produto?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction className="rounded-full bg-red-500 hover:bg-red-600" onClick={confirmDelete} data-testid="confirm-delete-btn">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
