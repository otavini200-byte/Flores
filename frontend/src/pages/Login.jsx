import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/apiClient";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const u = await login(email, password);
      navigate(u.role === "admin" ? "/admin" : "/");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="pt-16 min-h-screen flex items-center justify-center px-6" data-testid="login-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-8 sm:p-10"
      >
        <h1 className="font-display font-black text-3xl tracking-tighter">Entrar</h1>
        <p className="mt-2 text-sm text-muted-foreground">Acesse sua conta NOVA.</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="login-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              data-testid="login-password"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500" data-testid="login-error">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full rounded-full" size="lg" disabled={loading} data-testid="login-submit">
            {loading ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          Não tem conta?{" "}
          <Link to="/register" className="font-semibold text-foreground underline" data-testid="go-register">
            Cadastre-se
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
