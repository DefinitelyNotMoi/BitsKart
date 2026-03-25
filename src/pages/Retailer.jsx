import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ImageUpload from '../components/ImageUpload';

import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Container,
  TextField,
  Card,
  CardContent,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Grid,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Box,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Slider,
  TableContainer,
  Paper
} from "@mui/material";

import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  where,
  updateDoc,
  runTransaction,
} from "firebase/firestore";

import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";
import StatusTracker from "../components/StatusTracker";
import { openRazorpayCheckout } from "../utils/razorpay";
import { calculateDistanceKm } from "../utils/geo";

// --- Category Prices (Retailer buys at this price) ---
const CATEGORY_PRICES = {
  Shirts: 500,
  Trousers: 700,
  Jackets: 1500,
  Shoes: 1200,
  Accessories: 300,
  "Ethnic Wear": 2000,
};

const containerStyle = { width: "100%", height: "300px", borderRadius: "16px", marginTop: "20px" };
const CUSTOMER_STATUS_FLOW = ["Placed", "Confirmed", "Packed", "Out for Delivery", "Delivered"];
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID;

// --- Map Component (Copied from Wholesaler.jsx for consistency) ---
const MapComponent = ({ location, setLocation }) => {
  const [mapError, setMapError] = useState(false);

  if (mapError) return <Typography color="error">Google Maps failed to load.</Typography>;

  return (
    <LoadScript
      googleMapsApiKey="AIzaSyCsN0VtNMbHd96oGj7Ch16FVqHQoyT0Uqc" // Make sure to use your actual API key
      onError={(e) => {
        console.error("Google Maps failed to load", e);
        setMapError(true);
      }}
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={location}
        zoom={12}
        onClick={(e) => setLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
      >
        <Marker position={location} />
      </GoogleMap>
    </LoadScript>
  );
};

const buildWholesalerStockView = (stockData = {}, wholesalerData = {}) => {
  const cleanStock = {};
  Object.entries(stockData).forEach(([key, value]) => {
    if (typeof value === "number") {
      cleanStock[key] = value;
    }
  });

  return {
    ...cleanStock,
    ...(stockData.productNames && { productNames: stockData.productNames }),
    prices: {
      ...(wholesalerData.prices || {}),
      ...(stockData.prices || {}),
    },
  };
};

const fetchWholesalerStockView = async (wholesalerId) => {
  const [stockSnap, wholesalerSnap] = await Promise.all([
    getDoc(doc(db, "stocks", wholesalerId)),
    getDoc(doc(db, "wholesalers", wholesalerId)),
  ]);

  const stockData = stockSnap.exists() ? stockSnap.data() : {};
  const wholesalerData = wholesalerSnap.exists() ? wholesalerSnap.data() : {};

  return buildWholesalerStockView(stockData, wholesalerData);
};

export default function Retailer() {
  const navigate = useNavigate();

  // --- State ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState({ lat: 12.9716, lng: 77.5946 }); // Default: Bangalore
  const [productNames, setProductNames] = useState({});
  const [myStock, setMyStock] = useState({});
  const [myOrders, setMyOrders] = useState([]);
  const [retailerId, setRetailerId] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- Wholesaler Browsing State ---
  const [wholesalers, setWholesalers] = useState([]);
  const [selectedWholesalerId, setSelectedWholesalerId] = useState("");
  const [selectedWholesalerStock, setSelectedWholesalerStock] = useState({});
  const [quantities, setQuantities] = useState({}); // For new order
  const [cart, setCart] = useState(null); // Staged order
  const [customerOrders, setCustomerOrders] = useState([]);
  const [updatingCustomerOrderId, setUpdatingCustomerOrderId] = useState(null);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState(null);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryTargetOrder, setDeliveryTargetOrder] = useState(null);
  const [deliveryForm, setDeliveryForm] = useState({ expectedDate: "", cost: "", carrier: "", notes: "" });
  const [savingDeliveryInfo, setSavingDeliveryInfo] = useState(false);
  const [distanceFilterKm, setDistanceFilterKm] = useState(30);
  //Functions

  const fetchWholesalerProductNames = async (wholesalerId) => {
    try {
      const stockDoc = await getDoc(doc(db, "stocks", wholesalerId));
      if (stockDoc.exists()) {
        return stockDoc.data().productNames || {};
      }
      return {};
    } catch (error) {
      console.error("Error fetching product names:", error);
      return {};
    }
  };


  const wholesalersWithDistance = useMemo(
    () =>
      wholesalers.map((ws) => ({
        ...ws,
        distanceKm: ws.location ? calculateDistanceKm(location, ws.location) : null,
      })),
    [wholesalers, location]
  );

  // Show all wholesalers regardless of distance
  const filteredWholesalers = useMemo(
    () => [...wholesalersWithDistance],
    [wholesalersWithDistance]
  );

  const selectedWholesaler = wholesalersWithDistance.find((w) => w.id === selectedWholesalerId);

  // --- Geolocation ---
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => console.warn("Geolocation error:", err)
      );
    }
  }, []);

  // --- Auth listener ---
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setRetailerId(user.uid);
        // Fetch Retailer Profile
        const docSnap = await getDoc(doc(db, "retailers", user.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name || "");
          setEmail(data.email || user.email);
          setLocation(data.location || { lat: 12.9716, lng: 77.5946 });
        } else {
          setEmail(user.email); // Pre-fill email from auth
        }
        await fetchMyStock(user.uid);
        await fetchMyOrders(user.uid);
        await fetchCustomerOrders(user.uid);
        await fetchWholesalers();
      } else {
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  // --- Profile ---
  const handleSaveProfile = async () => {
    const user = auth.currentUser;
    if (!user) return alert("Sign in first!");
    await setDoc(doc(db, "retailers", user.uid), {
      name,
      email,
      location,
      createdAt: serverTimestamp(),
    }, { merge: true });
    // Ensure a stock document exists
    await setDoc(doc(db, "stocks", user.uid), {}, { merge: true });
    alert("Retailer info saved!");
  };

  // --- Data Fetching ---
  const fetchMyStock = async (uid) => {
    if (!uid) return;
    const stockSnap = await getDoc(doc(db, "stocks", uid));
    if (stockSnap.exists()) {
      const stockData = stockSnap.data();
      // Remove the updatedAt field if it exists
      const { updatedAt, ...stockWithoutTimestamp } = stockData;
      setMyStock(stockWithoutTimestamp);
    } else {
      setMyStock({});
    }
  };

  const fetchMyOrders = async (uid) => {
    if (!uid) return;
    const q = query(
      collection(db, "retailerOrders"),
      where("retailerId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const snapshot = await getDocs(q);
    const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    setMyOrders(orders);
  };

  const fetchWholesalers = async () => {
    try {
      console.log('Fetching wholesalers...');
      const wholesalersSnapshot = await getDocs(collection(db, "wholesalers"));
      console.log(`Found ${wholesalersSnapshot.docs.length} wholesalers in database`);
      
      const wholesalersList = [];
      
      // Process each wholesaler
      for (const doc of wholesalersSnapshot.docs) {
        try {
          const wholesalerData = doc.data();
          console.log(`Processing wholesaler: ${doc.id} (${wholesalerData.name || 'no name'})`);

          const productNames = await fetchWholesalerProductNames(doc.id);
          console.log(`Product names for ${doc.id}:`, productNames);
          
          // Get stock data if available
          let hasStock = false;
          try {
            const stockSnap = await getDoc(doc(db, "stocks", doc.id));
            if (stockSnap.exists()) {
              const stockData = stockSnap.data();
              console.log(`Stock data for ${doc.id}:`, stockData);
              
              // Check if any stock item has quantity > 0
              hasStock = Object.values(stockData).some(
                value => typeof value === 'number' && value > 0
              );
            }
          } catch (stockError) {
            console.warn(`Error fetching stock for ${doc.id}:`, stockError);
          }
          
          // Include the wholesaler regardless of stock status
          wholesalersList.push({ 
            id: doc.id, 
            ...wholesalerData,
            productNames : productNames,
            hasStock
          });
          
        } catch (error) {
          console.error(`Error processing wholesaler ${doc.id}:`, error);
          // Continue with next wholesaler
          continue;
        }
      }
      
      console.log(`Processed ${wholesalersList.length} wholesalers`);
      setWholesalers(wholesalersList);
      
    } catch (error) {
      console.error('Error in fetchWholesalers:', error);
      setWholesalers([]);
    }
  };

  const fetchCustomerOrders = async (uid) => {
    if (!uid) return;
    try {
      const q = query(
        collection(db, "customerOrders"),
        where("retailerId", "==", uid),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setCustomerOrders(orders);
    } catch (error) {
      console.error("Error fetching customer orders:", error);
      setCustomerOrders([]);
    }
  };

  const handleSelectWholesaler = async (id) => {
    if (!id) {
      setSelectedWholesalerId("");
      setSelectedWholesalerStock({});
      setCart(null);
      setQuantities({});
      return;
    }

    try {
      setSelectedWholesalerId(id);
      setCart(null);
      setQuantities({});

      console.log(`Fetching data for wholesaler: ${id}`);
      const stockView = await fetchWholesalerStockView(id);
      setSelectedWholesalerStock(stockView);
    } catch (error) {
      console.error("Error fetching wholesaler data:", error);
      setSelectedWholesalerStock({});
      alert('Failed to load wholesaler data. Please try again.');
    }
  };

  const handleQuantityChange = (category, value) => {
    const maxAvailable = selectedWholesalerStock?.[category] || 0;
    if (value === "") {
      setQuantities((prev) => ({ ...prev, [category]: "" }));
      return;
    }

    const numericValue = Math.max(0, parseInt(value, 10) || 0);
    const clampedValue = Math.min(numericValue, maxAvailable);
    setQuantities((prev) => ({ ...prev, [category]: clampedValue }));
  };

  const handleAddToCart = () => {
    const orderItems = Object.entries(quantities)
      .filter(([_, qty]) => qty > 0)
      .map(([category, qty]) => {
        // Get price from wholesaler's prices, fallback to default if not found
        const basePrice = selectedWholesalerStock?.prices?.[category] || CATEGORY_PRICES[category] || 0;
        return { 
          category, 
          quantity: parseInt(qty), 
          price: basePrice,
          basePrice // Store the original price for reference
        };
      });

    if (!orderItems.length) return alert("Enter at least one quantity!");
    
    const totalAmount = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    setCart({ 
      items: orderItems, 
      totalAmount, 
      wholesalerId: selectedWholesalerId 
    });
    setQuantities({});
    alert("Order added to cart! Click 'Place Order' to confirm.");
  };

  const handlePlaceOrder = async () => {
    if (!retailerId || !selectedWholesalerId || cart.items.length === 0) return;
    if (!RAZORPAY_KEY_ID) {
      alert("Missing Razorpay key. Set VITE_RAZORPAY_KEY_ID in your .env file.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      alert("Please sign in again.");
      navigate("/login");
      return;
    }

    setIsPaying(true);
    setError(null);

    let paymentResponse = null;
    let paymentError = null;
    try {
      paymentResponse = await openRazorpayCheckout({
        key: RAZORPAY_KEY_ID,
        amount: cart.totalAmount * 100,
        currency: "INR",
        name: "BITSmart Retailer Purchase",
        description: `${cart.items.length} item(s) from ${selectedWholesaler?.name || "Wholesaler"}`,
        prefill: {
          name: name || user.displayName || user.email?.split("@")[0] || "Retailer",
          email: email || user.email,
        },
        notes: {
          retailerId,
          wholesalerId: selectedWholesalerId,
        },
      });
    } catch (err) {
      paymentError = err;
      console.warn("Razorpay checkout not completed", err);
      // Continue with order placement in pending state for testing purposes
    }

    try {
      const orderData = {
        retailerId,
        retailerName: name || email,
        wholesalerId: selectedWholesalerId,
        wholesalerName: selectedWholesaler?.name || 'Unknown Wholesaler',
        items: cart.items,
        totalAmount: cart.totalAmount,
        status: 'Placed',
        statusHistory: [{
          status: 'Placed',
          timestamp: Timestamp.now(),
          note: paymentResponse ? 'Order placed with payment' : 'Order placed',
        }],
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        paymentId: paymentResponse?.razorpay_payment_id || null,
        razorpaySignature: paymentResponse?.razorpay_signature || null,
        paymentStatus: paymentResponse ? 'paid' : 'pending',
        paymentErrorMessage: paymentError?.message || null,
      };

      const orderRef = await addDoc(collection(db, 'retailerOrders'), orderData);
      console.log('Order placed successfully:', orderRef.id);

      await updateMyStock(cart.items, retailerId);
      await decrementWholesalerStock(cart.items, selectedWholesalerId);

      setMyOrders(prevOrders => [{
        id: orderRef.id,
        ...orderData,
      }, ...prevOrders]);
      await fetchMyOrders(retailerId);

      alert(paymentResponse ? 'Payment successful! Order placed.' : 'Order placed. Payment pending.');
      setCart(null);
      setQuantities({});
    } catch (error) {
      console.error('Error placing order:', error);
      setError('Failed to place order. Contact support.');
    } finally {
      setIsPaying(false);
    }
  };

  // This updates the RETAILER's stock
  const updateMyStock = async (orderItems, uid) => {
    if (!uid) return;
    const stockRef = doc(db, "stocks", uid);
    const stockSnap = await getDoc(stockRef);
    const existingStock = stockSnap.exists() ? stockSnap.data() : {};
    
    // Create a new object with existing stock data, excluding any timestamp fields
    const { updatedAt, ...cleanExistingStock } = existingStock;
    const updatedStock = { ...cleanExistingStock };
    const existingPrices = existingStock.prices || {};
    const updatedPrices = { ...existingPrices };
    
    // Update stock with new quantities
    orderItems.forEach(({ category, quantity, price, basePrice }) => {
      updatedStock[category] = (updatedStock[category] || 0) + parseInt(quantity);

      const buyingPrice = Number(
        (basePrice ?? price ?? existingPrices[category] ?? CATEGORY_PRICES[category] ?? 0)
      );
      if (!Number.isNaN(buyingPrice) && buyingPrice > 0) {
        updatedPrices[category] = buyingPrice;
      }
    });
    if (Object.keys(updatedPrices).length) {
      updatedStock.prices = updatedPrices;
    }
    
    // Persist product names from selected wholesaler for display
    if (selectedWholesalerStock?.productNames) {
      updatedStock.productNames = {
        ...(existingStock.productNames || {}),
        ...selectedWholesalerStock.productNames,
      };
    }

    await setDoc(stockRef, updatedStock, { merge: true });
    setMyStock(updatedStock);
    console.log('Updated stock:', updatedStock);
  };

  const decrementWholesalerStock = async (orderItems, wholesalerId) => {
    if (!wholesalerId || !orderItems?.length) return;
    const stockRef = doc(db, "stocks", wholesalerId);

    await runTransaction(db, async (transaction) => {
      const stockSnap = await transaction.get(stockRef);
      const existingStock = stockSnap.exists() ? stockSnap.data() : {};
      const updatedStock = { ...existingStock };

      orderItems.forEach(({ category, quantity }) => {
        if (!category) return;
        const current = parseInt(updatedStock[category], 10) || 0;
        const decrementBy = parseInt(quantity, 10) || 0;
        updatedStock[category] = Math.max(0, current - decrementBy);
      });

      transaction.set(stockRef, updatedStock, { merge: true });
    });

    const refreshedStock = await fetchWholesalerStockView(wholesalerId);
    if (selectedWholesalerId === wholesalerId) {
      setSelectedWholesalerStock(refreshedStock);
    }

    setWholesalers((prev) =>
      prev.map((ws) =>
        ws.id === wholesalerId
          ? {
              ...ws,
              hasStock: Object.entries(refreshedStock).some(
                ([_, value]) => typeof value === "number" && value > 0
              ),
            }
          : ws
      )
    );
  };

  const openDeliveryDialog = (order) => {
    setDeliveryTargetOrder(order);
    setDeliveryForm({
      expectedDate: order.deliveryInfo?.expectedDate || "",
      cost: order.deliveryInfo?.cost || "",
      carrier: order.deliveryInfo?.carrier || "",
      notes: order.deliveryInfo?.notes || "",
    });
    setDeliveryDialogOpen(true);
  };

  const closeDeliveryDialog = () => {
    setDeliveryDialogOpen(false);
    setDeliveryTargetOrder(null);
  };

  const handleDeliveryFieldChange = (field, value) => {
    setDeliveryForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveDeliveryInfo = async () => {
    if (!deliveryTargetOrder) return;
    try {
      setSavingDeliveryInfo(true);
      const payload = {
        ...deliveryForm,
        updatedAt: Timestamp.now(),
        updatedBy: retailerId,
        updatedByName: name || email || "Retailer",
      };
      await updateDoc(doc(db, "customerOrders", deliveryTargetOrder.id), {
        deliveryInfo: payload,
      });
      setCustomerOrders((prev) =>
        prev.map((order) => (order.id === deliveryTargetOrder.id ? { ...order, deliveryInfo: payload } : order))
      );
      closeDeliveryDialog();
    } catch (error) {
      console.error("Failed to save delivery info", error);
      alert(`Unable to save delivery info: ${error?.message || "Unknown error"}`);
    } finally {
      setSavingDeliveryInfo(false);
    }
  };

  const getNextCustomerStatus = (currentStatus) => {
    const currentIndex = CUSTOMER_STATUS_FLOW.indexOf(currentStatus);
    if (currentIndex === -1) return CUSTOMER_STATUS_FLOW[0];
    return CUSTOMER_STATUS_FLOW[currentIndex + 1] || null;
  };

  const handleAdvanceCustomerOrder = async (order) => {
    if (!retailerId) return;
    const nextStatus = getNextCustomerStatus(order.status);
    if (!nextStatus) {
      alert("Order already delivered!");
      return;
    }
    setUpdatingCustomerOrderId(order.id);
    const orderRef = doc(db, "customerOrders", order.id);
    const updatedHistory = [
      ...(order.statusHistory || []),
      {
        status: nextStatus,
        timestamp: Timestamp.now(),
        note: `Updated by ${name || "Retailer"}`,
      },
    ];
    await updateDoc(orderRef, { status: nextStatus, statusHistory: updatedHistory });
    await fetchCustomerOrders(retailerId);
    setUpdatingCustomerOrderId(null);
  };

  const handleMarkDelivered = async (order) => {
    if (!retailerId || order.status === "Delivered") return;
    setUpdatingCustomerOrderId(order.id);
    const orderRef = doc(db, "customerOrders", order.id);
    const updatedHistory = [
      ...(order.statusHistory || []),
      {
        status: "Delivered",
        timestamp: Timestamp.now(),
        note: `Delivered by ${name || "Retailer"}`,
      },
    ];
    await updateDoc(orderRef, { status: "Delivered", statusHistory: updatedHistory });
    await fetchCustomerOrders(retailerId);
    setUpdatingCustomerOrderId(null);
  };

  const handleLogout = async () => {
    await auth.signOut();
    setRetailerId(null);
    navigate("/login");
  };

  if (loading) return <Container sx={{ textAlign: "center", marginTop: "40px" }}><CircularProgress /></Container>;

  return (
    <>
      <AppBar position="static" sx={{ background: "#004d40" }}>
        <Toolbar>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>BITSmart - Retailer Dashboard</Typography>
          <Button color="inherit" onClick={handleLogout}>Logout</Button>
        </Toolbar>
      </AppBar>
      <Container sx={{ marginTop: "40px" }}>
        {error && (
          <Box sx={{ mb: 2, p: 2, borderRadius: 1, bgcolor: "#ffebee", color: "#b71c1c" }}>
            {error}
          </Box>
        )}
        <Typography variant="h4" gutterBottom>Welcome, {name || email}</Typography>

        <Grid container spacing={4}>
          {/* --- Left Column: Ordering --- */}
          <Grid item xs={12} md={7}>
            {/* --- Wholesaler Selection --- */}
            <Card sx={{ p: 2, mb: 4 }}>
              <CardContent>
                <Typography variant="h5" gutterBottom>Place a New Order</Typography>
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                  </Typography>
                </Box>
                <FormControl fullWidth>
                  <InputLabel id="wholesaler-select-label">Select a Wholesaler</InputLabel>
                  <Select
                    labelId="wholesaler-select-label"
                    value={selectedWholesalerId}
                    label="Select a Wholesaler"
                    onChange={(e) => handleSelectWholesaler(e.target.value)}
                  >
                    <MenuItem value=""><em>None</em></MenuItem>
                    {filteredWholesalers.length === 0 && (
                      <MenuItem value="" disabled>
                        No wholesalers within range
                      </MenuItem>
                    )}
                    {filteredWholesalers.map((ws) => (
                      <MenuItem key={ws.id} value={ws.id}>{ws.name || ws.email}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </CardContent>
            </Card>

            {/* --- Wholesaler Stock & Ordering --- */}
            {selectedWholesaler && (
              <Card sx={{ p: 2, mb: 4 }}>
                <CardContent>
                  <Typography variant="h6">Order from: {selectedWholesaler.name}</Typography>
                  <TableContainer component={Paper} sx={{ mt: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Item</TableCell>
                          <TableCell align="right">Price (₹)</TableCell>
                          <TableCell align="right">Available</TableCell>
                          <TableCell align="right">Order Qty</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {Object.keys(selectedWholesalerStock).filter(cat => selectedWholesalerStock[cat] > 0).length > 0 ? 
                          Object.entries(selectedWholesalerStock)
                            .filter(([key, qty]) => typeof qty === 'number' && qty > 0) // Only show numeric stock entries
                            .map(([category, availableQty]) => {
                              const displayName = selectedWholesalerStock.productNames?.[category] || category;
                              const basePrice = selectedWholesalerStock?.prices?.[category] ||
                                selectedWholesaler?.prices?.[category] ||
                                CATEGORY_PRICES[category] || 0;
                              const price = basePrice;
                              return (
                                <TableRow key={category}>
                                  <TableCell>{displayName}</TableCell>
                                  <TableCell align="right">₹{price.toFixed(2)}</TableCell>
                                  <TableCell align="right">{availableQty}</TableCell>
                                  <TableCell align="right">
                                    <TextField
                                      size="small"
                                      type="number"
                                      InputProps={{ 
                                        inputProps: { 
                                          min: 0, 
                                          max: availableQty,
                                          style: { textAlign: 'right', width: '80px' }
                                        } 
                                      }}
                                      value={quantities[category] || ""}
                                      onChange={(e) => handleQuantityChange(category, e.target.value)}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          : (
                            <TableRow>
                              <TableCell colSpan={4} align="center">
                                <Typography color="textSecondary" sx={{ py: 2 }}>
                                  This wholesaler is out of stock.
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )
                        }
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {Object.keys(selectedWholesalerStock).filter(cat => selectedWholesalerStock[cat] > 0).length > 0 &&
                    <Button variant="contained" color="primary" sx={{ mt: 3 }} onClick={handleAddToCart}>Add to Cart</Button>
                  }
                </CardContent>
              </Card>
            )}

            {/* --- Cart --- */}
            {cart && (
              <Card sx={{ mt: 2, p: 2, border: "1px solid #004d40" }}>
                <Typography variant="h6">Pending Order</Typography>
                <TableContainer component={Paper} sx={{ mt: 1, mb: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell align="right">Price (₹)</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Total (₹)</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cart.items.map((item) => {
                        // Use the price from the cart item which already includes the 5% markup
                        const price = item.price;
                        const total = price * item.quantity;
                        return (
                          <TableRow key={item.category}>
                            <TableCell>{item.category}</TableCell>
                            <TableCell align="right">₹{price.toFixed(2)}</TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                            <TableCell align="right">₹{total.toFixed(2)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow>
                        <TableCell colSpan={3} align="right"><strong>Subtotal:</strong></TableCell>
                        <TableCell align="right"><strong>₹{cart.totalAmount.toFixed(2)}</strong></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
                <Button
                  variant="contained"
                  color="success"
                  sx={{ mt: 2 }}
                  onClick={handlePlaceOrder}
                  disabled={isPaying}
                >
                  {isPaying ? "Processing..." : "Pay & Place Order"}
                </Button>
              </Card>
            )}
          </Grid>

          {/* --- Right Column: My Info --- */}
          <Grid item xs={12} md={5}>
            {/* --- Profile --- */}
            <Card sx={{ p: 2, mb: 4 }}>
              <CardContent>
                <Typography variant="h6">My Profile</Typography>
                <TextField
                  label="Retailer Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  fullWidth
                  sx={{ mt: 2 }}
                />
                <TextField
                  label="Email"
                  value={email}
                  disabled
                  fullWidth
                  sx={{ mt: 2 }}
                />
                <Typography variant="body2" sx={{ mt: 2, mb: 1 }}>Store Location</Typography>
                <MapComponent location={location} setLocation={setLocation} />
                <Button variant="contained" sx={{ mt: 2 }} onClick={handleSaveProfile}>Save Profile</Button>
              </CardContent>
            </Card>
            {/* --- My Stock --- */}
            <Card sx={{ p: 2, mb: 4 }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>My Current Stock</Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Category</TableCell>
                      <TableCell>Name</TableCell>
                      <TableCell align="right">Selling Price</TableCell>
                      <TableCell align="right">Qty</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(() => {
                      // Filter out 'images' and 'prices' entries from the stock
                      const excludedKeys = new Set(['images', 'prices', 'productnames']);
                      const validStockEntries = Object.entries(myStock).filter(
                        ([key]) => !excludedKeys.has(key.toLowerCase())
                      );
                      
                      if (validStockEntries.length === 0) {
                        return (
                          <TableRow>
                            <TableCell colSpan={4}>No stock yet. Place an order!</TableCell>
                          </TableRow>
                        );
                      }
                      
                      return validStockEntries.map(([category, value]) => {
                        // If the value is an object, it's a nested structure (like Shirts: {Small: 1, Medium: 2})
                        if (value && typeof value === 'object' && !Array.isArray(value)) {
                          return Object.entries(value).map(([subCategory, qty]) => {
                            const displayName = myStock?.productNames?.[category] || category;
                            const storedPrice = myStock?.prices?.[category];
                            const buyingPrice = Number(
                              (typeof storedPrice === 'object' ? storedPrice?.[subCategory] : storedPrice) ??
                              CATEGORY_PRICES[category]?.[subCategory] ??
                              CATEGORY_PRICES[category] ??
                              0
                            );
                            const sellingPrice = Math.ceil((buyingPrice || 0) * 1.05); // 5% markup
                            return (
                              <TableRow key={`${category}-${subCategory}`}>
                                <TableCell>{category} - {subCategory}</TableCell>
                                <TableCell>{displayName} ({subCategory})</TableCell>
                                <TableCell align="right">₹{sellingPrice.toFixed(2)}</TableCell>
                                <TableCell align="right">{qty}</TableCell>
                              </TableRow>
                            );
                          });
                        }
                        // If it's a direct quantity value and not a number (to avoid showing image data)
                        if (typeof value === 'number') {
                          const displayName = myStock?.productNames?.[category] || category;
                          const storedPrice = myStock?.prices?.[category];
                          const buyingPrice = Number(storedPrice ?? CATEGORY_PRICES[category] ?? 0);
                          const sellingPrice = Math.ceil((buyingPrice || 0) * 1.05); // 5% markup
                          return (
                            <TableRow key={category}>
                              <TableCell>{category}</TableCell>
                              <TableCell>{displayName}</TableCell>
                              <TableCell align="right">₹{sellingPrice.toFixed(2)}</TableCell>
                              <TableCell align="right">{value}</TableCell>
                            </TableRow>
                          );
                        }
                        return null;
                      });
                    })()}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
        
        {/* --- Full Width: Order History --- */}
        <Grid item xs={12} sx={{mt: 4, mb: 6}}>
          <Typography variant="h5" sx={{ mb: 2 }}>My Purchase History</Typography>
          <Card>
            <CardContent>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Items</TableCell>
                    <TableCell>Total ₹</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Tracking</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {myOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={5}>No orders placed yet.</TableCell></TableRow>
                  ) : myOrders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell>{order.createdAt?.toDate().toLocaleString() || "—"}</TableCell>
                      <TableCell>{order.items.map(i => `${i.category}: ${i.quantity}`).join(", ")}</TableCell>
                      <TableCell>₹{order.totalAmount || 0}</TableCell>
                      <TableCell>{order.status}</TableCell>
                      <TableCell>
                        <StatusTracker history={order.statusHistory} emptyLabel="No updates" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Grid>

        {/* --- Customer Orders --- */}
        <Grid item xs={12} sx={{mt: 6, mb: 6}}>
          <Typography variant="h5" sx={{ mb: 2 }}>Customer Orders</Typography>
          <Card>
            <CardContent>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Items</TableCell>
                    <TableCell>Total ₹</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Tracking</TableCell>
                    <TableCell>Delivery info</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {customerOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={8}>No customer orders yet.</TableCell></TableRow>
                  ) : customerOrders.map(order => {
                    const nextStatus = getNextCustomerStatus(order.status);
                    return (
                      <TableRow key={order.id}>
                        <TableCell>{order.createdAt?.toDate?.().toLocaleString() || "—"}</TableCell>

                        <TableCell>{order.customerName || order.customerEmail || "Unknown"}</TableCell>
                        <TableCell>{order.items.map(i => `${i.category}: ${i.quantity}`).join(", ")}</TableCell>
                        <TableCell>₹{order.totalAmount || 0}</TableCell>
                        <TableCell>{order.status}</TableCell>
                        <TableCell>
                          <StatusTracker history={order.statusHistory} emptyLabel="Awaiting updates" />
                        </TableCell>
                        <TableCell>
                          {order.deliveryInfo ? (
                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                              <Typography variant="body2">Expected: {order.deliveryInfo.expectedDate || "—"}</Typography>
                              <Typography variant="caption" color="text.secondary">
                                {order.deliveryInfo.carrier || "Carrier TBD"} · {order.deliveryInfo.cost ? `₹${order.deliveryInfo.cost}` : "Cost TBD"}
                              </Typography>
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">Not shared</Typography>
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} justifyContent="center">
                            <Button
                              variant="contained"
                              size="small"
                              disabled={!nextStatus || updatingCustomerOrderId === order.id}
                              onClick={() => handleAdvanceCustomerOrder(order)}
                            >
                              {nextStatus ? `Mark ${nextStatus}` : "Completed"}
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => openDeliveryDialog(order)}
                            >
                              {order.deliveryInfo ? "Edit Delivery" : "Add Delivery"}
                            </Button>
                            <Button
                              variant="text"
                              size="small"
                              onClick={() => handleMarkDelivered(order)}
                              disabled={order.status === "Delivered" || updatingCustomerOrderId === order.id}
                            >
                              Mark Delivered
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>

              </Table>
            </CardContent>
          </Card>
        </Grid>

      </Container>

      <Dialog open={deliveryDialogOpen} onClose={closeDeliveryDialog} fullWidth maxWidth="sm">
        <DialogTitle>
          {deliveryTargetOrder ? `Delivery info for order ${deliveryTargetOrder.id.slice(-6)}` : "Delivery info"}
        </DialogTitle>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Expected date"
                type="date"
                value={deliveryForm.expectedDate}
                onChange={(e) => handleDeliveryFieldChange("expectedDate", e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="Delivery cost (₹)"
                type="number"
                value={deliveryForm.cost}
                onChange={(e) => handleDeliveryFieldChange("cost", e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Carrier / Partner"
                value={deliveryForm.carrier}
                onChange={(e) => handleDeliveryFieldChange("carrier", e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Notes"
                multiline
                minRows={3}
                value={deliveryForm.notes}
                onChange={(e) => handleDeliveryFieldChange("notes", e.target.value)}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeliveryDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveDeliveryInfo} disabled={savingDeliveryInfo}>
            {savingDeliveryInfo ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

    </>
  );
}