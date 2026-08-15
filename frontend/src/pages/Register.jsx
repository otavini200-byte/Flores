import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "../context/AuthContext";
import { formatApiErrorDetail } from "../lib/apiClient";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(name, email, password);
      navigate("/");
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="pt-16 min-h-screen flex items-center justify-center px-6" data-testid="register-page">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-border bg-card p-8 sm:p-10"
      >
        <h1 className="font-display font-black text-3xl tracking-tighter">Criar conta</h1>
        <p className="mt-2 text-sm text-muted-foreground">Junte-se à NOVA em segundos.</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required data-testid="register-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="register-email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required data-testid="register-password" />
          </div>
          {error && (
            <p className="text-sm text-red-500" data-testid="register-error">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full rounded-full" size="lg" disabled={loading} data-testid="register-submit">
            {loading ? "Criando…" : "Criar conta"}
          </Button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="font-semibold text-foreground underline" data-testid="go-login">
            Entrar
          </Link>
        </p>
      </motion.div>
    </main>
  );
}
