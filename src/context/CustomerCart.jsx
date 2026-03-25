import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Card,
  CardContent,
  Container,
  Grid,
  Stack,
  TextField,
  IconButton,
  Divider,
  Box,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteIcon from "@mui/icons-material/Delete";
import { useCart } from "../context/CartContext";
import { openRazorpayCheckout } from "../utils/razorpay";
import { auth, db } from "../firebase";
import { addDoc, collection, serverTimestamp, Timestamp } from "firebase/firestore";

const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

export default function CustomerCart() {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, clearCart } = useCart();
  const [isPaying, setIsPaying] = useState(false);

  const subtotal = useMemo(() => items.reduce((sum, line) => sum + line.price * line.quantity, 0), [items]);

  const handleQuantityChange = (line, value) => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    updateQuantity(line.key, Math.max(1, Math.min(parsed, line.availableQty)));
  };

  const handleRemove = (key) => removeItem(key);

  const handleCheckout = async () => {
    if (!items.length) {
      alert("Your cart is empty.");
      return;
    }
    if (!RAZORPAY_KEY_ID) {
      alert("Missing Razorpay key. Set VITE_RAZORPAY_KEY_ID in your .env file.");
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      alert("Please log in again to continue.");
      navigate("/login");
      return;
    }

    setIsPaying(true);
    let paymentResponse = null;
    let paymentError = null;

    try {
      paymentResponse = await openRazorpayCheckout({
        key: RAZORPAY_KEY_ID,
        amount: subtotal * 100,
        currency: "INR",
        name: "BITSmart Boutique Checkout",
        description: `${items.length} item(s) from multiple boutiques`,
        prefill: {
          name: user.displayName || "BITSmart Customer",
          email: user.email,
        },
        notes: {
          customerId: user.uid,
        },
      });
    } catch (error) {
      paymentError = error;
      console.warn("Razorpay checkout not completed", error);
    }

    try {
      const groupedByRetailer = items.reduce((acc, line) => {
        acc[line.retailerId] = acc[line.retailerId] || [];
        acc[line.retailerId].push(line);
        return acc;
      }, {});

      const customerName = user.displayName || user.email?.split("@")[0] || "Customer";

      await Promise.all(
        Object.entries(groupedByRetailer).map(async ([retailerId, lines]) => {
          const retailerName = lines[0].retailerName;
          const retailerEmail = lines[0].retailerEmail;
          const totalAmount = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);

          await addDoc(collection(db, "customerOrders"), {
            retailerId,
            retailerName,
            retailerEmail,
            customerId: user.uid,
            customerName,
            customerEmail: user.email,
            items: lines.map((line) => ({
              category: line.category,
              quantity: line.quantity,
              price: line.price,
            })),
            totalAmount,
            status: "Placed",
            statusHistory: [
              {
                status: "Placed",
                timestamp: Timestamp.now(),
                note: paymentResponse ? "Order placed with payment" : "Order placed without payment",
              },
            ],
            createdAt: Timestamp.now(),
            createdAtServer: serverTimestamp(),
            paymentId: paymentResponse?.razorpay_payment_id || null,
            razorpaySignature: paymentResponse?.razorpay_signature || null,
            paymentStatus: paymentResponse ? "paid" : "pending",
            paymentErrorMessage: paymentError?.message || null,
          });
        })
      );

      clearCart();
      alert(paymentResponse ? "Payment successful and orders placed!" : "Orders placed. Payment pending.");
      navigate("/customer");
    } catch (error) {
      console.error("Failed to complete checkout", error);
      alert(`Unable to complete checkout: ${error?.message || "Unknown error"}`);
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <BoxShell>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{ backgroundColor: "rgba(15,23,42,0.85)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton color="inherit" onClick={() => navigate("/customer")}> <ArrowBackIcon /> </IconButton>
            <Typography variant="h6" className="gradient-text" sx={{ fontWeight: 700 }}>Your Cart</Typography>
          </Stack>
          
          <Button color="inherit" onClick={() => navigate("/customer")}>Continue shopping</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        {items.length === 0 ? (
          <EmptyState onBrowse={() => navigate("/customer")} />
        ) : (
          <Grid container spacing={4}>
            <Grid item xs={12} md={8}>
              <Stack spacing={3}>
                {items.map((line) => (
                  <Card key={line.key} className="glass-panel" sx={{ p: 3 }}>
                    <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems={{ xs: "flex-start", sm: "center" }}>
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>{line.category}</Typography>
                        <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)" }}>
                          {line.retailerName}
                        </Typography>
                        <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.6)" }}>
                          ₹{line.price} · {line.availableQty} available
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <TextField
                          label="Qty"
                          type="number"
                          size="small"
                          value={line.quantity}
                          onChange={(e) => handleQuantityChange(line, e.target.value)}
                          InputProps={{ inputProps: { min: 1, max: line.availableQty } }}
                        />
                        <Typography variant="h6" sx={{ minWidth: 80, textAlign: "right" }}>
                          ₹{line.price * line.quantity}
                        </Typography>
                        <IconButton color="inherit" onClick={() => handleRemove(line.key)}>
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    </Stack>
                  </Card>
                ))}
              </Stack>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card className="glass-panel" sx={{ p: 3, position: "sticky", top: 120 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Order Summary</Typography>
                <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.1)" }} />
                <Stack spacing={1}>
                  <SummaryRow label="Subtotal" value={`₹${subtotal}`} />
                  <SummaryRow label="Shipping" value="Free" />
                </Stack>
                <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.1)" }} />
                <SummaryRow label="Total" value={`₹${subtotal}`} accent />
                <Button
                  fullWidth
                  variant="contained"
                  sx={{ mt: 3, py: 1.4, fontWeight: 600, background: "linear-gradient(120deg,#22d3ee,#6366f1)" }}
                  onClick={handleCheckout}
                  disabled={isPaying || !items.length}
                >
                  {isPaying ? "Processing..." : "Checkout securely"}
                </Button>
                <Button fullWidth sx={{ mt: 1, color: "#f8fafc" }} onClick={clearCart} disabled={!items.length || isPaying}>
                  Clear cart
                </Button>
              </Card>
            </Grid>
          </Grid>
        )}
      </Container>
    </BoxShell>
  );
}

const SummaryRow = ({ label, value, accent }) => (
  <Stack direction="row" justifyContent="space-between">
    <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)" }}>{label}</Typography>
    <Typography variant="body1" sx={{ fontWeight: accent ? 700 : 500 }}>{value}</Typography>
  </Stack>
);

const EmptyState = ({ onBrowse }) => (
  <Card className="glass-panel" sx={{ textAlign: "center", p: { xs: 4, md: 6 } }}>
    <Typography variant="h4" className="gradient-text" sx={{ fontWeight: 700 }}>
      Your cart is empty
    </Typography>
    <Typography variant="body2" sx={{ mt: 2, color: "rgba(248,250,252,0.7)" }}>
      Discover boutiques, add items, and return here to complete payment.
    </Typography>
    <Button variant="contained" sx={{ mt: 4, px: 4, py: 1.4, background: "linear-gradient(120deg,#ec4899,#a855f7)" }} onClick={onBrowse}>
      Explore collections
    </Button>
  </Card>
);

const BoxShell = ({ children }) => (
  <div className="page-shell" style={{ minHeight: "100vh" }}>
    <div className="glow-circle pink floating" />
    <div className="glow-circle blue" />
    {children}
  </div>
);
