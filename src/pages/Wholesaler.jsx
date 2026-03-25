import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { uploadImage } from "../utils/fileUpload";
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
  Box
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
  query,
  orderBy,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";

import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

// --- Default Category Prices ---
const DEFAULT_CATEGORY_PRICES = {
  Shirts: 500,
  Trousers: 700,
  Jackets: 1500,
  Shoes: 1200,
  Accessories: 300,
  "Ethnic Wear": 2000,
};

const containerStyle = { width: "100%", height: "400px", borderRadius: "16px", marginTop: "20px" };
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#AA00FF", "#FF4444"];

// --- Map Component ---
const MapComponent = ({ location, setLocation }) => {
  const [mapError, setMapError] = useState(false);

  if (mapError) return <Typography color="error">Google Maps failed to load.</Typography>;

  return (
    <LoadScript
      googleMapsApiKey="AIzaSyCsN0VtNMbHd96oGj7Ch16FVqHQoyT0Uqc"
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

export default function Wholesaler() {
  const navigate = useNavigate();

  // --- State ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [selectedCategories, setSelectedCategories] = useState(Object.keys(DEFAULT_CATEGORY_PRICES));
  const [location, setLocation] = useState({ lat: 12.9716, lng: 77.5946 });
  const [stock, setStock] = useState({});
  const [formStock, setFormStock] = useState({});
  const [prices, setPrices] = useState({});
  const [editingPrices, setEditingPrices] = useState({});
  const [productImages, setProductImages] = useState({});
  const [productNames, setProductNames] = useState({});
  const [orders, setOrders] = useState([]);
  const [wholesalerId, setWholesalerId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState({ success: false, message: '' });

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
        setWholesalerId(user.uid);
        const docSnap = await getDoc(doc(db, "wholesalers", user.uid));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setName(data.name);
          setEmail(data.email);
          // Always use all categories from DEFAULT_CATEGORY_PRICES
          setSelectedCategories(Object.keys(DEFAULT_CATEGORY_PRICES));
          setLocation(data.location || { lat: 12.9716, lng: 77.5946 });
        }
        await fetchStock(user.uid);
        await fetchOrders(user.uid);
      } else {
        navigate("/login");
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user) return alert("Sign in first!");
    await setDoc(doc(db, "wholesalers", user.uid), {
      name,
      email,
      categories: Object.keys(DEFAULT_CATEGORY_PRICES), // Always save all categories
      location,
      createdAt: new Date(),
    });
    await setDoc(doc(db, "stocks", user.uid), {}, { merge: true });
    alert("Wholesaler info saved!");
    await fetchStock(user.uid);
    await fetchOrders(user.uid);
  };

  // --- Stock Fetch/Update ---
  const fetchStock = async (uid) => {
    if (!uid) return;
    const stockSnap = await getDoc(doc(db, "stocks", uid));
    const stockData = stockSnap.exists() ? stockSnap.data() : {};
    
    // Initialize both stock and formStock with the same data
    setStock(stockData);
    setFormStock({...stockData});
    
    // Load saved prices and images if they exist
    const savedPrices = stockData.prices || {};
    const savedImages = stockData.images || {};
    const savedProductNames = stockData.productNames || {};
    setPrices(savedPrices);
    setEditingPrices({...savedPrices});
    setProductImages(savedImages);
    setProductNames(savedProductNames);
  };
  const updateStock = async (stockData, uid, pricesData = null) => {
    if (!uid) return false;
    try {
      const stockRef = doc(db, "stocks", uid);
      const dataToUpdate = {
        ...stockData,
        ...(pricesData && { prices: pricesData })
      };
      await setDoc(stockRef, dataToUpdate, { merge: true });
      setStock(prev => ({
        ...prev,
        ...stockData,
        ...(pricesData && { prices: pricesData })
      }));
      return true;
    } catch (error) {
      console.error("Error updating stock:", error);
      return false;
    }
  };

  useEffect(() => {
    if (!wholesalerId) return;

    const ordersRef = collection(db, "orders");
    const q = query(ordersRef, orderBy("createdAt", "desc"));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const order = { id: change.doc.id, ...change.doc.data() };
          
          // Only process orders from retailers (not the wholesaler's own orders)
          if (order.wholesalerId === wholesalerId && order.userId !== wholesalerId) {
            updateInventoryForOrder(order);
          }
        }
      });
    });

    return () => unsubscribe();
  }, [wholesalerId]);

  const updateInventoryForOrder = async (order) => {
  try {
    const stockRef = doc(db, "stocks", wholesalerId);
    const stockSnap = await getDoc(stockRef);
    const currentStock = stockSnap.exists() ? stockSnap.data() : {};
    const updatedStock = { ...currentStock };

    // Update stock for each item in the order
    let hasInsufficientStock = false;
    
    // First, check if we have enough stock
    for (const item of order.items) {
      const currentQty = updatedStock[item.category] || 0;
      if (currentQty < item.quantity) {
        hasInsufficientStock = true;
        break;
      }
    }

    if (hasInsufficientStock) {
      console.warn("Insufficient stock for order:", order.id);
      // You might want to update the order status here
      return;
    }

    // If we have enough stock, update the inventory
    for (const item of order.items) {
      updatedStock[item.category] = (updatedStock[item.category] || 0) - item.quantity;
    }

    // Update Firestore
    await setDoc(stockRef, updatedStock, { merge: true });
    
    // Update local state
    setStock(updatedStock);

    console.log("Inventory updated for order:", order.id);
  } catch (error) {
    console.error("Error updating inventory for order:", error);
  }
};

  

  const handlePriceUpdate = (category, value) => {
    setEditingPrices(prev => ({
      ...prev,
      [category]: value === '' ? '' : Math.max(0, parseInt(value) || 0)
    }));
  };

  const handleImageUpload = async (e, category) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setSaveStatus({ success: false, message: 'Processing image...' });
      
      // Reset file input to allow re-uploading the same file
      e.target.value = '';

      try {
        // Convert image to base64
        const base64Image = await uploadImage(file);
        console.log('Image converted to base64 successfully');

        // Update the product images state with base64 string
        setProductImages(prev => {
          console.log('Updating product images state');
          return {
            ...prev,
            [category]: base64Image
          };
        });
        
        setSaveStatus({ 
          success: true, 
          message: 'Image uploaded successfully!',
          image: base64Image // Include the image in the status for debugging
        });
      } catch (uploadError) {
        console.error('Error in upload process:', {
          error: uploadError,
          message: uploadError.message,
          stack: uploadError.stack
        });
        throw uploadError; // Re-throw to be caught by the outer catch
      }
    } catch (error) {
      console.error('Error in handleImageUpload:', {
        error,
        message: error.message,
        stack: error.stack
      });
      setSaveStatus({ 
        success: false, 
        message: `Upload failed: ${error.message || 'Unknown error'}` 
      });
    }
  };
  
  const fileInputs = useRef({});

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setSaveStatus({ success: false, message: '' });
    
    try {
      const user = auth.currentUser;
      if (!user) {
        setSaveStatus({ success: false, message: 'Please sign in first' });
        setIsSaving(false);
        return;
      }

      // Prepare stock data for saving
      const stockToSave = {};
      const invalidCategories = [];

      // Process each category
      for (const [cat, qty] of Object.entries(formStock)) {
        // Convert to number, empty string becomes 0
        const quantity = qty === '' ? 0 : Number(qty);
        
        // Validate the quantity
        if (isNaN(quantity)) {
          invalidCategories.push(cat);
        } else {
          stockToSave[cat] = quantity;
        }
      }

      // Update prices with the editing values
      const updatedPrices = {};
      Object.entries(editingPrices).forEach(([cat, price]) => {
        if (price !== '') {
          updatedPrices[cat] = price;
        } else {
          // Use default price if not specified
          updatedPrices[cat] = DEFAULT_CATEGORY_PRICES[cat] || 0;
        }
      });
      
      // Prepare data to save
      const dataToSave = {
        ...stockToSave,
        prices: updatedPrices,
        images: productImages,
        productNames: productNames,
        updatedAt: serverTimestamp()
      };
      
      // 1. First update the stock with the new quantities and prices
      const stockSuccess = await updateStock(dataToSave, user.uid, updatedPrices);
      
      if (!stockSuccess) {
        throw new Error('Failed to update stock');
      }
      
      // 2. Update the wholesaler document with the latest prices and info
      const wholesalerRef = doc(db, "wholesalers", user.uid);
      await setDoc(wholesalerRef, {
        name: name || user.email.split('@')[0],
        email: user.email,
        location: location,
        prices: updatedPrices,
        updatedAt: serverTimestamp()
      }, { merge: true });
      
      // 3. Ensure a retailer document exists for this wholesaler
      const retailerRef = doc(db, "retailers", user.uid);
      const retailerSnap = await getDoc(retailerRef);
      
      if (!retailerSnap.exists()) {
        // Create a retailer document for this wholesaler
        await setDoc(retailerRef, {
          name: name || user.email.split('@')[0],
          email: user.email,
          isWholesaler: true,
          location: location,
          prices: updatedPrices,
          createdAt: serverTimestamp()
        });
      } else {
        // Update existing retailer document with latest prices
        await setDoc(retailerRef, {
          prices: updatedPrices,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      
      // Update the states with the saved values
      setPrices(updatedPrices);
      setStock(stockToSave);
      
      setSaveStatus({ 
        success: true, 
        message: 'Inventory and prices updated successfully!' 
      });
    } catch (error) {
      console.error('Error saving inventory:', error);
      setSaveStatus({ 
        success: false, 
        message: 'Failed to update inventory. Please try again.' 
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Orders ---
  const fetchOrders = async (uid) => {
    if (!uid) return;
    const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const allOrders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const myOrders = allOrders.filter((o) => o.wholesalerId === uid);
    setOrders(myOrders);
  };

  // Function to update stock when quantities are changed
  const handleStockUpdate = (category, quantity) => {
    const newStock = { ...stock, [category]: parseInt(quantity) || 0 };
    setStock(newStock);
  };

  // Price update handler is now at the top of the file

  const handleLogout = async () => {
    await auth.signOut();
    setWholesalerId(null);
    navigate("/login");
  };

  if (loading) return <Container sx={{ textAlign: "center", marginTop: "40px" }}><CircularProgress /></Container>;

  // --- Pie Chart Data ---
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const topRetailersMap = {};
  const productTotals = {};
  orders.forEach((order) => {
    const date = order.createdAt?.toDate?.() || new Date();
    if (date < thirtyDaysAgo) return;
    if (order.userId !== wholesalerId) {
      const key = order.retailerName || order.retailerEmail || "Unknown";
      topRetailersMap[key] = (topRetailersMap[key] || 0) + (order.totalAmount || 0);
    }
    order.items.forEach((item) => { productTotals[item.category] = (productTotals[item.category] || 0) + item.quantity; });
  });
  const topRetailersArray = Object.entries(topRetailersMap).map(([name, revenue]) => ({ name, revenue }));
  const productData = Object.entries(productTotals).map(([name, value]) => ({ name, value }));

  return (
    <>
      <AppBar position="static" sx={{ background: "#263238" }}>
        <Toolbar>
          <Typography variant="h5" sx={{ flexGrow: 1 }}>BITSmart - Wholesaler Dashboard</Typography>
          <Button color="inherit" onClick={handleLogout}>Logout</Button>
        </Toolbar>
      </AppBar>
      <Container sx={{ textAlign: "center", marginTop: "40px" }}>
        <Typography variant="h4" gutterBottom>Welcome, {name}</Typography>

        {/* Update Inventory */}
        <Card sx={{ p: 3, mb: 4 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Update Inventory</Typography>
            {selectedCategories.length === 0 ? (
              <Typography color="textSecondary">No categories selected.</Typography>
            ) : (
              <Grid container spacing={2}>
                {selectedCategories.map((cat) => {
                  // const customerPrice = DEFAULT_CATEGORY_PRICES[cat] || 0;
                  // const wholesalePrice = Math.round(customerPrice * 0.95); // 5% less than customer price
                  
                  return (
                    <Grid item xs={12} sm={6} md={4} key={cat}>
                      <Card variant="outlined" sx={{ p: 2, height: '100%' }}>
                        <Typography variant="subtitle1" fontWeight="bold">{cat}</Typography>
                        
                        {/* Product Name */}
                        <TextField
                          fullWidth
                          label="Product Name"
                          value={productNames[cat] || ''}
                          onChange={(e) => setProductNames(prev => ({
                            ...prev,
                            [cat]: e.target.value
                          }))}
                          size="small"
                          sx={{ mb: 2 }}
                        />
                        
                        {/* Product Image Upload */}
                        <Box sx={{ mt: 1, mb: 2, textAlign: 'center' }}>
                          {productImages[cat] ? (
                            <img 
                              src={productImages[cat]} 
                              alt={cat} 
                              style={{ 
                                maxWidth: '100%', 
                                maxHeight: '150px',
                                borderRadius: '4px',
                                marginBottom: '8px'
                              }} 
                            />
                          ) : (
                            <Box 
                              sx={{ 
                                height: '100px', 
                                border: '2px dashed #ccc', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                borderRadius: '4px',
                                mb: 1
                              }}
                            >
                              <Typography color="textSecondary">No image</Typography>
                            </Box>
                          )}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            ref={el => fileInputs.current[cat] = el}
                            onChange={(e) => handleImageUpload(e, cat)}
                          />
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => fileInputs.current[cat]?.click()}
                          >
                            {productImages[cat] ? 'Change Image' : 'Upload Image'}
                          </Button>
                        </Box>
                        
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                          <TextField
                            fullWidth
                            label="Price (₹)"
                            type="numeric"
                            value={editingPrices[cat] ?? ''}
                            onChange={(e) => handlePriceUpdate(cat, e.target.value)}
                            //inputProps={{ min: 0 }}
                            size="small"
                          />
                        </Box>
                        {/* <Typography variant="body2" color="textSecondary" gutterBottom>
                          Price: ₹
                        </Typography> */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}>
                          <TextField
                            fullWidth
                            label="Quantity"
                            type="numeric"
                            value={formStock[cat] ?? ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0);
                              setFormStock(prev => ({
                                ...prev,
                                [cat]: value === '' ? '' : value
                              }));
                            }}
                            inputProps={{ min: 0 }}
                            size="small"
                          />
                        </Box>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
            {selectedCategories.length > 0 && (
              <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <Button 
                  variant="contained" 
                  color="primary" 
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  startIcon={isSaving ? <CircularProgress size={20} /> : null}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
                {saveStatus.message && (
                  <Typography 
                    color={saveStatus.success ? 'success.main' : 'error.main'}
                    variant="body2"
                  >
                    {saveStatus.message}
                  </Typography>
                )}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Current Stock */}
        <Typography variant="h5" sx={{ mb: 2 }}>Current Stock</Typography>
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Category</TableCell>
                  <TableCell>Product Name</TableCell>
                  <TableCell>Qty</TableCell>
                  <TableCell>Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.keys(DEFAULT_CATEGORY_PRICES).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>No categories available</TableCell>
                  </TableRow>
                ) : (
                  Object.keys(DEFAULT_CATEGORY_PRICES).map((cat) => (
                    <TableRow key={cat}>
                      <TableCell>{cat}</TableCell>
                      <TableCell>{productNames[cat] || 'Not specified'}</TableCell>
                      <TableCell>{typeof stock[cat] === 'number' ? stock[cat] : 0}</TableCell>
                      <TableCell>₹{(prices[cat] || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Orders Table */}
        <Typography variant="h5" sx={{ mb: 2, mt: 4 }}>Recent Orders</Typography>
        <Card sx={{ mb: 4 }}>
          <CardContent>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Retailer</TableCell>
                  <TableCell>Items</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders && orders.length > 0 ? (
                  orders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>{order.retailerName || order.retailerEmail || "Unknown"}</TableCell>
                      <TableCell>{order.items.map(i => `${i.category}: ${i.quantity}`).join(", ")}</TableCell>
                      <TableCell>₹{order.totalAmount || 0}</TableCell>
                      <TableCell>{order.status}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4}>No orders yet</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Charts */}
        <Typography variant="h5" sx={{ mb: 2 }}>Top Retailers by Revenue (30 days)</Typography>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={topRetailersArray} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
              {topRetailersArray.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(val) => `₹${val}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>

        <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>Product Orders (30 days)</Typography>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie data={productData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
              {productData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>

        {/* Map */}
        <Typography variant="h6" sx={{ mt: 4 }}>Store Location</Typography>
        <MapComponent location={location} setLocation={setLocation} />
      </Container>
    </>
  );
}
