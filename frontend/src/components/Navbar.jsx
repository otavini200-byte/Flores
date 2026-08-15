import { Link, useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, LogOut, LayoutDashboard, Package, User, Flower2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { Button } from "@/components/ui/button";
import CartDrawer from "./CartDrawer";

export default function Navbar() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header
      className="fixed top-0 inset-x-0 z-50 border-b border-border bg-background/70 backdrop-blur-xl"
      data-testid="navbar"
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group" data-testid="logo-link">
          <Flower2 className="h-6 w-6 text-[hsl(var(--accent))]" />
          <span className="font-display font-semibold text-2xl leading-none tracking-tight">
            Jardim das Velas
          </span>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3">
          {user && user.role === "admin" && (
            <Button
              variant={location.pathname === "/admin" ? "default" : "ghost"}
              size="sm"
              className="rounded-full"
              onClick={() => navigate("/admin")}
              data-testid="nav-admin-btn"
            >
              <LayoutDashboard className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Admin</span>
            </Button>
          )}
          {user && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => navigate("/orders")}
              data-testid="nav-orders-btn"
            >
              <Package className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Meus Pedidos</span>
            </Button>
          )}

          <button
            onClick={() => setCartOpen(true)}
            className="relative rounded-full p-2.5 hover:bg-muted transition-colors"
            data-testid="cart-toggle-btn"
          >
            <ShoppingBag className="h-5 w-5" />
            {count > 0 && (
              <motion.span
                key={count}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-[hsl(var(--accent))] text-white text-[11px] font-bold flex items-center justify-center"
                data-testid="cart-count-badge"
              >
                {count}
              </motion.span>
            )}
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <span className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                {user.name.split(" ")[0]}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  logout();
                  navigate("/");
                }}
                data-testid="logout-btn"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => navigate("/login")}
              data-testid="nav-login-btn"
            >
              Entrar
            </Button>
          )}
        </nav>
      </div>
      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </header>
  );
}
