import { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
const keyOf = (pid, size) => `${pid}|${size}`;

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("jdv_cart") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("jdv_cart", JSON.stringify(items));
  }, [items]);

  const add = (product, variant, qty = 1) => {
    const price =
      product.on_promotion && product.discount_percent
        ? +(variant.price * (1 - product.discount_percent / 100)).toFixed(2)
        : variant.price;
    setItems((prev) => {
      const k = keyOf(product.id, variant.size);
      const existing = prev.find((i) => keyOf(i.product_id, i.size) === k);
      if (existing) {
        return prev.map((i) =>
          keyOf(i.product_id, i.size) === k
            ? { ...i, quantity: Math.min(i.quantity + qty, variant.stock) }
            : i
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          size: variant.size,
          price,
          image_url: product.image_url,
          quantity: qty,
          stock: variant.stock,
        },
      ];
    });
  };

  const updateQty = (product_id, size, quantity) =>
    setItems((prev) =>
      prev
        .map((i) =>
          keyOf(i.product_id, i.size) === keyOf(product_id, size) ? { ...i, quantity } : i
        )
        .filter((i) => i.quantity > 0)
    );

  const remove = (product_id, size) =>
    setItems((prev) =>
      prev.filter((i) => keyOf(i.product_id, i.size) !== keyOf(product_id, size))
    );

  const clear = () => setItems([]);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, add, updateQty, remove, clear, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
