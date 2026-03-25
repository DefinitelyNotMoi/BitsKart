import { createContext, useContext, useEffect, useMemo, useReducer } from "react";

const CartContext = createContext();

const getInitialState = () => {
  if (typeof window === "undefined") return { items: [] };
  try {
    const stored = window.localStorage.getItem("bitsmart_cart");
    return stored ? JSON.parse(stored) : { items: [] };
  } catch (error) {
    console.warn("Failed to parse cart from storage", error);
    return { items: [] };
  }
};

const cartReducer = (state, action) => {
  switch (action.type) {
    case "ADD_ITEM": {
      const { item, quantity } = action.payload;
      const key = `${item.retailerId}-${item.category}`;
      const existing = state.items.find((line) => line.key === key);
      const clampedQty = Math.min(quantity, item.availableQty);
      let nextItems;
      if (existing) {
        nextItems = state.items.map((line) =>
          line.key === key
            ? {
                ...line,
                quantity: Math.min(line.quantity + clampedQty, line.availableQty),
              }
            : line
        );
      } else {
        nextItems = [...state.items, { ...item, key, quantity: clampedQty }];
      }
      return { items: nextItems };
    }
    case "UPDATE_QUANTITY": {
      const { key, quantity } = action.payload;
      const nextItems = state.items.map((line) =>
        line.key === key
          ? {
              ...line,
              quantity: Math.max(1, Math.min(quantity, line.availableQty)),
            }
          : line
      );
      return { items: nextItems };
    }
    case "REMOVE_ITEM": {
      return { items: state.items.filter((line) => line.key !== action.payload) };
    }
    case "CLEAR_CART": {
      return { items: [] };
    }
    default:
      return state;
  }
};

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, undefined, getInitialState);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("bitsmart_cart", JSON.stringify(state));
    }
  }, [state]);

  const value = useMemo(() => {
    const addItem = (item, quantity) => dispatch({ type: "ADD_ITEM", payload: { item, quantity } });
    const updateQuantity = (key, quantity) => dispatch({ type: "UPDATE_QUANTITY", payload: { key, quantity } });
    const removeItem = (key) => dispatch({ type: "REMOVE_ITEM", payload: key });
    const clearCart = () => dispatch({ type: "CLEAR_CART" });

    const totalItems = state.items.reduce((sum, line) => sum + line.quantity, 0);

    return { items: state.items, addItem, updateQuantity, removeItem, clearCart, totalItems };
  }, [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
};
