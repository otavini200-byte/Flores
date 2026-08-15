import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import api from "../lib/apiClient";
import ProductCard from "../components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

const HERO =
  "https://static.prod-images.emergentagent.com/jobs/fb5ce246-6070-4fdc-9e9b-60bafea00ac3/images/6337954c06275480c0b03992b31b0145927b47a9d5210b89f416067b8e3b2d3e.jpeg";

export default function Storefront() {
  const [products, setProducts] = useState(null);
  const [filter, setFilter] = useState("Todos");

  useEffect(() => {
    api.get("/products").then(({ data }) => setProducts(data)).catch(() => setProducts([]));
  }, []);

  const categories = ["Todos", ...new Set((products || []).map((p) => p.category))];
  const visible = (products || []).filter((p) => filter === "Todos" || p.category === filter);

  return (
    <main className="pt-16" data-testid="storefront">
      <section className="relative overflow-hidden border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] font-semibold text-[hsl(var(--accent))]">
              <Sparkles className="h-3.5 w-3.5" /> Velas artesanais
            </span>
            <h1 className="mt-4 font-display font-semibold text-5xl sm:text-6xl lg:text-7xl leading-[0.95]">
              Flores que <br /> perfumam a casa.
            </h1>
            <p className="mt-6 text-base text-muted-foreground max-w-md leading-relaxed">
              Velas aromáticas esculpidas à mão em formato de flores. Cada peça é feita com
              carinho pela Jardim das Velas — escolha seu aroma e tamanho favorito.
            </p>
            <a
              href="#catalogo"
              className="mt-8 inline-flex items-center rounded-full bg-primary text-primary-foreground px-8 py-3.5 font-semibold text-sm hover:-translate-y-0.5 transition-transform"
              data-testid="hero-cta"
            >
              Ver catálogo
            </a>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            <img
              src={HERO}
              alt="Coleção de velas Jardim das Velas"
              className="rounded-3xl w-full aspect-[3/2] object-cover shadow-2xl"
            />
          </motion.div>
        </div>
      </section>

      <section id="catalogo" className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-10">
          <h2 className="font-display font-semibold text-4xl">Catálogo</h2>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilter(c)}
                className={`rounded-full px-4 py-2 text-sm font-medium border transition-colors ${
                  filter === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border hover:bg-secondary"
                }`}
                data-testid={`filter-${c}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {products === null ? (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-2xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <p className="text-muted-foreground py-20 text-center">Nenhum produto encontrado.</p>
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
