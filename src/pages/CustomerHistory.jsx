import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Container,
  Button,
  Stack,
  Card,
  CardContent,
  Grid,
  Chip,
  Divider,
  TextField,
  MenuItem,
  IconButton,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Box,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import RateReviewIcon from "@mui/icons-material/RateReview";
import HistoryIcon from "@mui/icons-material/History";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocs,
  limit,
  startAfter,
} from "firebase/firestore";
import { auth, db } from "../firebase";
import StatusTracker from "../components/StatusTracker";

export default function CustomerHistory() {
  const navigate = useNavigate();
  const [liveOrders, setLiveOrders] = useState([]);
  const [olderOrders, setOlderOrders] = useState([]);
  const [feedbacks, setFeedbacks] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("");
  const [feedbackText, setFeedbackText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [ordersExhausted, setOrdersExhausted] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [liveLastDoc, setLiveLastDoc] = useState(null);
  const [lastOlderDoc, setLastOlderDoc] = useState(null);
  const feedbackUnsubscribeRef = useRef(null);
  const ordersUnsubscribeRef = useRef(null);
  const ORDERS_PAGE_SIZE = 20;
  const FEEDBACK_LIMIT = 50;

  const combinedOrders = useMemo(() => {
    const seen = new Set();
    const merged = [];
    const appendUnique = (list) => {
      list.forEach((order) => {
        if (!seen.has(order.id)) {
          seen.add(order.id);
          merged.push(order);
        }
      });
    };
    appendUnique(liveOrders);
    appendUnique(olderOrders);
    return merged;
  }, [liveOrders, olderOrders]);

  const subscribeToFeedback = (limitCount) => {
    if (feedbackUnsubscribeRef.current) feedbackUnsubscribeRef.current();
    const feedbackQuery = query(
      collection(db, "customerFeedback"),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    );
    feedbackUnsubscribeRef.current = onSnapshot(feedbackQuery, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setFeedbacks(data);
      setLoadingFeedbacks(false);
    });
  };

  const handleLoadMoreOrders = async () => {
    const startAfterDoc = lastOlderDoc || liveLastDoc;
    if (!currentUser || ordersExhausted || loadingMoreOrders || !startAfterDoc) return;
    setLoadingMoreOrders(true);
    try {
      const moreOrdersQuery = query(
        collection(db, "customerOrders"),
        where("customerId", "==", currentUser.uid),
        orderBy("createdAt", "desc"),
        startAfter(startAfterDoc),
        limit(ORDERS_PAGE_SIZE)
      );
      const snapshot = await getDocs(moreOrdersQuery);
      const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setOlderOrders((prev) => {
        const existingIds = new Set(prev.map((order) => order.id));
        const newOrders = data.filter((order) => !existingIds.has(order.id));
        return [...prev, ...newOrders];
      });
      setLastOlderDoc(snapshot.docs[snapshot.docs.length - 1] || startAfterDoc);
      if (snapshot.docs.length < ORDERS_PAGE_SIZE) setOrdersExhausted(true);
    } catch (error) {
      console.error("Failed to load more orders", error);
      alert("Unable to load more orders.");
      setOrdersExhausted(true);
    } finally {
      setLoadingMoreOrders(false);
    }
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) {
        feedbackUnsubscribeRef.current?.();
        ordersUnsubscribeRef.current?.();
        setCurrentUser(null);
        setLiveOrders([]);
        setOlderOrders([]);
        setFeedbacks([]);
        navigate("/login");
        return;
      }
      setCurrentUser(user);
      setLoadingOrders(true);
      setOrdersExhausted(false);
      setOlderOrders([]);
      setLastOlderDoc(null);
      if (ordersUnsubscribeRef.current) ordersUnsubscribeRef.current();
      const ordersQuery = query(
        collection(db, "customerOrders"),
        where("customerId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(ORDERS_PAGE_SIZE)
      );
      ordersUnsubscribeRef.current = onSnapshot(ordersQuery, (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        setLiveOrders(data);
        setLiveLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
        if (snapshot.docs.length < ORDERS_PAGE_SIZE && lastOlderDoc === null) {
          setOrdersExhausted(true);
        } else if (snapshot.docs.length === ORDERS_PAGE_SIZE) {
          setOrdersExhausted(false);
        }
        setLoadingOrders(false);
      });
      subscribeToFeedback(FEEDBACK_LIMIT);
    });

    return () => {
      unsubscribeAuth();
      feedbackUnsubscribeRef.current?.();
      ordersUnsubscribeRef.current?.();
    };
  }, [navigate, lastOlderDoc]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedProduct("");
      return;
    }
    const order = combinedOrders.find((o) => o.id === selectedOrderId);
    setSelectedProduct(order?.items?.[0]?.category || "");
  }, [selectedOrderId, combinedOrders]);

  const orderOptions = useMemo(
    () => combinedOrders.map((order) => ({
      id: order.id,
      label: `${order.retailerName || "Boutique"} • ₹${order.totalAmount || 0}`,
      items: order.items || [],
    })),
    [combinedOrders]
  );

  const selectedOrder = useMemo(
    () => combinedOrders.find((order) => order.id === selectedOrderId),
    [combinedOrders, selectedOrderId]
  );
  const selectedOrderItems = selectedOrder?.items || [];

  const handleSubmitFeedback = async (event) => {
    event.preventDefault();
    if (!currentUser) {
      alert("Please log in again.");
      return;
    }
    if (!selectedOrder || !selectedProduct || !feedbackText.trim()) {
      alert("Select an order, product, and add feedback.");
      return;
    }

    try {
      setSubmitting(true);
      await addDoc(collection(db, "customerFeedback"), {
        orderId: selectedOrder.id,
        retailerId: selectedOrder.retailerId,
        retailerName: selectedOrder.retailerName,
        productCategory: selectedProduct,
        feedback: feedbackText.trim(),
        customerId: currentUser.uid,
        customerName: currentUser.displayName || currentUser.email?.split("@")[0] || "Customer",
        createdAt: serverTimestamp(),
      });
      setFeedbackText("");
      alert("Thanks! Your feedback is now visible to everyone.");
    } catch (error) {
      console.error("Failed to submit feedback", error);
      alert(`Unable to submit feedback: ${error?.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const renderOrders = () => {
    if (loadingOrders) {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 6 }}>
          <CircularProgress color="inherit" />
          <Typography variant="body2" color="rgba(248,250,252,0.7)">Loading your orders…</Typography>
        </Stack>
      );
    }

    if (!combinedOrders.length) {
      return (
        <Card className="glass-panel">
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <HistoryIcon sx={{ fontSize: 48, color: "rgba(248,250,252,0.5)" }} />
            <Typography variant="h5" sx={{ mt: 2, fontWeight: 600 }}>No purchases yet</Typography>
            <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)", mt: 1 }}>
              Once you check out, your orders will appear here automatically.
            </Typography>
            <Button variant="contained" sx={{ mt: 3 }} onClick={() => navigate("/customer")}>Browse collections</Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <>
        {combinedOrders.map((order) => (
          <Card key={order.id} className="glass-panel">
            <CardContent>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Typography variant="subtitle2" sx={{ color: "rgba(248,250,252,0.7)" }}>
                    {order.createdAt?.toDate?.().toLocaleString() || "Pending timestamp"}
                  </Typography>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>{order.retailerName || "Boutique"}</Typography>
                  <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)" }}>
                    Order #{order.id.slice(-6)} • ₹{order.totalAmount || 0}
                  </Typography>
                </Box>
                <Chip label={order.status || "Placed"} color="secondary" />
              </Stack>

              <Divider sx={{ my: 2, borderColor: "rgba(255,255,255,0.1)" }} />

              <Stack spacing={1}>
                {(order.items || []).map((item, idx) => (
                  <Stack key={`${order.id}-${item.category}-${idx}`} direction="row" justifyContent="space-between">
                    <Typography variant="body2">{item.category}</Typography>
                    <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)" }}>
                      {item.quantity} × ₹{item.price}
                    </Typography>
                  </Stack>
                ))}
              </Stack>

              <Box sx={{ mt: 2 }}>
                <StatusTracker history={order.statusHistory} emptyLabel="No updates shared yet" />
              </Box>
            </CardContent>
          </Card>
        ))}
        {!ordersExhausted && combinedOrders.length > 0 && (
          <Button
            variant="outlined"
            sx={{ alignSelf: "center", mt: 2 }}
            onClick={handleLoadMoreOrders}
            disabled={loadingMoreOrders}
          >
            {loadingMoreOrders ? "Loading more…" : "Load more orders"}
          </Button>
        )}
      </>
    );
  };

  const renderFeedbackFeed = () => {
    if (loadingFeedbacks) {
      return (
        <Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
          <CircularProgress color="inherit" size={24} />
          <Typography variant="caption" color="rgba(248,250,252,0.7)">Fetching community feedback…</Typography>
        </Stack>
      );
    }

    if (!feedbacks.length) {
      return (
        <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)", textAlign: "center", py: 2 }}>
          No feedback yet. Be the first to share your experience!
        </Typography>
      );
    }

    return (
      <List disablePadding>
        {feedbacks.map((fb) => (
          <ListItem key={fb.id} alignItems="flex-start" sx={{ px: 0 }}>
            <ListItemText
              primary={
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={fb.productCategory || "Product"} size="small" />
                  <Typography variant="subtitle2">{fb.retailerName || "Boutique"}</Typography>
                  <Typography variant="caption" sx={{ color: "rgba(248,250,252,0.6)" }}>
                    {fb.createdAt?.toDate?.().toLocaleString() || "Just now"}
                  </Typography>
                </Stack>
              }
              secondary={
                <>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>{fb.feedback}</Typography>
                  <Typography variant="caption" sx={{ color: "rgba(248,250,252,0.6)" }}>
                    — {fb.customerName || "Customer"}
                  </Typography>
                </>
              }
            />
          </ListItem>
        ))}
      </List>
    );
  };

  return (
    <div className="page-shell" style={{ minHeight: "100vh" }}>
      <div className="glow-circle pink floating" />
      <div className="glow-circle blue" />

      <AppBar
        position="sticky"
        elevation={0}
        sx={{ backgroundColor: "rgba(15,23,42,0.85)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}
      >
        <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton color="inherit" onClick={() => navigate("/customer")}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" className="gradient-text" sx={{ fontWeight: 700 }}>
              Purchase History
            </Typography>
          </Stack>
          <Button color="inherit" onClick={() => navigate("/cart")}>Open cart</Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
        <Grid container spacing={4}>
          <Grid item xs={12} md={7}>
            <Stack spacing={3}>{renderOrders()}</Stack>
          </Grid>
          <Grid item xs={12} md={5}>
            <Card className="glass-panel" sx={{ mb: 4 }}>
              <CardContent>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                  <RateReviewIcon />
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Share feedback
                  </Typography>
                </Stack>
                <Stack component="form" spacing={2} onSubmit={handleSubmitFeedback}>
                  <TextField
                    select
                    label="Select order"
                    value={selectedOrderId}
                    onChange={(e) => setSelectedOrderId(e.target.value)}
                    fullWidth
                  >
                    {orderOptions.map((order) => (
                      <MenuItem key={order.id} value={order.id}>
                        {order.label}
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    select
                    label="Select product"
                    value={selectedProduct}
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    disabled={!selectedOrderItems.length}
                    fullWidth
                  >
                    {selectedOrderItems.map((item, idx) => (
                      <MenuItem key={`${selectedOrderId}-${item.category}-${idx}`} value={item.category}>
                        {item.category} ({item.quantity} pcs)
                      </MenuItem>
                    ))}
                  </TextField>

                  <TextField
                    label="Feedback"
                    multiline
                    minRows={4}
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Tell others about fit, finish, service, or delivery…"
                    fullWidth
                  />

                  <Button
                    type="submit"
                    variant="contained"
                    sx={{ py: 1.4, fontWeight: 600, background: "linear-gradient(120deg,#22d3ee,#6366f1)" }}
                    disabled={submitting}
                  >
                    {submitting ? "Sending…" : "Post feedback"}
                  </Button>
                </Stack>
              </CardContent>
            </Card>

            <Card className="glass-panel">
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  Community feedback
                </Typography>
                <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)", mb: 2 }}>
                  Every customer comment appears here so boutiques can improve, and shoppers can trust recommendations.
                </Typography>
                {renderFeedbackFeed()}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Container>
    </div>
  );
}
