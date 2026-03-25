import { useCallback, useEffect, useMemo, useState } from "react";
import {
  // ... your existing imports ...
  Card,
  CardContent,
  CardActions,  // Add this line
  // ... rest of your imports ...
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Grid, 
  CardActionArea,
  Container,
  Box,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  CircularProgress,
  Badge,
  Slider,
} from "@mui/material";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";
import { GoogleMap, LoadScript, Marker } from "@react-google-maps/api";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { useCart } from "../context/CartContext";
import { calculateDistanceKm } from "../utils/geo";
import { seedDemoData } from "../utils/demoSeeder";


const calculateEstimatedDeliveryDate = (distanceKm) => {
  const baseDays = 1; // Base delivery time in days
  const daysPer50Km = 0.5; // Additional days per 50km
  
  const additionalDays = Math.ceil((distanceKm / 50) * daysPer50Km);
  const totalDays = baseDays + additionalDays;
  
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + totalDays);
  
  return {
    estimatedDelivery: deliveryDate,
    deliveryDays: totalDays
  };
};

const formatDeliveryEstimate = (estimatedDelivery) => {
  const today = new Date();
  const deliveryDate = new Date(estimatedDelivery);
  const diffTime = Math.abs(deliveryDate - today);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays} days (${deliveryDate.toDateString()})`;
  return deliveryDate.toDateString();
};

const categories = [
  { name: "Shirts", gradient: "linear-gradient(135deg,#f97316,#fb7185)" },
  { name: "Trousers", gradient: "linear-gradient(135deg,#0ea5e9,#6366f1)" },
  { name: "Jackets", gradient: "linear-gradient(135deg,#14b8a6,#84cc16)" },
  { name: "Shoes", gradient: "linear-gradient(135deg,#f472b6,#facc15)" },
  { name: "Accessories", gradient: "linear-gradient(135deg,#38bdf8,#818cf8)" },
  { name: "Ethnic Wear", gradient: "linear-gradient(135deg,#c084fc,#9333ea)" },
];

const stats = [
  { title: "Favourite Boutiques", value: "18" },
  { title: "Orders Delivered", value: "142" },
  { title: "Reward Points", value: "3,420" },
];

const CUSTOMER_PRICE_MULTIPLIER = 1.05;

const DEFAULT_CUSTOMER_PRICES = {
  Shirts: 1299,
  Trousers: 1499,
  Jackets: 2799,
  Shoes: 2199,
  Accessories: 799,
  "Ethnic Wear": 3299,
};

const DEFAULT_LOCATION = { lat: 12.9716, lng: 77.5946 };

const formatDistanceLabel = (distanceKm) => {
  if (typeof distanceKm === "number") {
    return `${distanceKm} km away`;
  }
  return "Distance unavailable";
};

const normalizeCategoryKey = (categoryName = "") =>
  categoryName.toLowerCase().replace(/\s+/g, "");

const parsePositiveNumber = (value) => {
  const num = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(num) && num > 0 ? num : null;
};

const resolveDisplayPrice = (price, categoryName) =>
  parsePositiveNumber(price) ?? parsePositiveNumber(DEFAULT_CUSTOMER_PRICES[categoryName]) ?? 0;

const getRetailerPriceForCategory = (retailer = {}, categoryName) => {
  if (!categoryName) return 0;
  const normalizedKey = `${normalizeCategoryKey(categoryName)}Price`;
  const priceSources = [
    retailer?.prices?.[categoryName],
    retailer?.stock?.prices?.[categoryName],
    retailer?.[normalizedKey],
    retailer?.[`${categoryName.toLowerCase()}Price`],
  ];

  for (const source of priceSources) {
    const parsed = parsePositiveNumber(source);
    if (parsed !== null) return Math.ceil(parsed * CUSTOMER_PRICE_MULTIPLIER);
  }

  return resolveDisplayPrice(undefined, categoryName);
};

const mapContainerStyle = {
  width: '100%',
  height: 'calc(100% - 80px)',
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  top: '80px',
};

export default function Customer() {
  const navigate = useNavigate();
  const { addItem, totalItems } = useCart();
  const [customerLocation, setCustomerLocation] = useState(DEFAULT_LOCATION);
  const [mapCenter, setMapCenter] = useState(DEFAULT_LOCATION);
  const [locationStatus, setLocationStatus] = useState("pending");
  const [retailers, setRetailers] = useState([]);
  const [loadingRetailers, setLoadingRetailers] = useState(true);
  const [dialogCategory, setDialogCategory] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRetailerId, setSelectedRetailerId] = useState("");
  const [desiredQty, setDesiredQty] = useState(1);
  const [isSeeding, setIsSeeding] = useState(false);
  const [distanceFilterKm, setDistanceFilterKm] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [viewingCategory, setViewingCategory] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("unsupported");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCustomerLocation(coords);
        setMapCenter(coords);
        setLocationStatus("ready");
      },
      (error) => {
        console.warn("Geolocation error:", error);
        setLocationStatus("denied");
        setMapCenter(DEFAULT_LOCATION);
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchRetailers = async () => {
      setLoadingRetailers(true);
      try {
        const retailerSnapshot = await getDocs(collection(db, "retailers"));
        const retailerList = await Promise.all(
          retailerSnapshot.docs.map(async (docSnap) => {
            const data = docSnap.data();
            const stockSnap = await getDoc(doc(db, "stocks", docSnap.id));
            return {
              id: docSnap.id,
              name: data.name || data.storeName || "Retailer",
              email: data.email,
              stock: stockSnap.exists() ? stockSnap.data() : {},
              location: data.location || DEFAULT_LOCATION,
            };
          })
        );
        if (isMounted) setRetailers(retailerList);
      } catch (error) {
        console.error("Failed to load retailers", error);
      } finally {
        if (isMounted) setLoadingRetailers(false);
      }
    };
    fetchRetailers();
    return () => {
      isMounted = false;
    };
  }, []);

  const retailersByDistance = useMemo(() =>
    retailers
      .map((retailer) => ({
        ...retailer,
        distanceKm: calculateDistanceKm(customerLocation, retailer.location),
      }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)),
  [retailers, customerLocation]);

  const filteredRetailers = useMemo(
    () =>
      retailersByDistance.filter((retailer) => {
        // Filter by distance
        if (retailer.distanceKm != null && retailer.distanceKm > distanceFilterKm) {
          return false;
        }
        
        // Filter by search term (case-insensitive)
        if (searchTerm && !retailer.name.toLowerCase().includes(searchTerm.toLowerCase())) {
          return false;
        }
        
        // Filter by category if one is selected
        if (selectedCategory && (!retailer.stock || !retailer.stock[selectedCategory])) {
          return false;
        }
        
        return true;
      }),
    [retailersByDistance, distanceFilterKm, searchTerm, selectedCategory]
  );

  const categoryRetailerMap = useMemo(() => {
    const map = {};
    filteredRetailers.forEach((retailer) => {
      categories.forEach((category) => {
        const availableQty = retailer.stock?.[category.name] || 0;
        if (availableQty > 0) {
          if (!map[category.name]) map[category.name] = [];
          const price = getRetailerPriceForCategory(retailer, category.name);
          
          map[category.name].push({
            retailerId: retailer.id,
            retailerName: retailer.name || retailer.email || "Retailer",
            retailerEmail: retailer.email,
            availableQty,
            price: price,
            distanceKm: retailer.distanceKm,
            location: retailer.location,
          });
        }
      });
    });
    return map;
  }, [filteredRetailers]);

  const recommendedCategories = useMemo(() =>
    categories
      .map((cat) => {
        const retailersForCat = categoryRetailerMap[cat.name] || [];
        if (!retailersForCat.length) return null;
        const closest = retailersForCat[0];
        return {
          name: cat.name,
          gradient: cat.gradient,
          distanceKm: closest.distanceKm,
          retailerName: closest.retailerName,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .slice(0, 3),
  [categoryRetailerMap]);

  const selectedRetailers = dialogCategory ? categoryRetailerMap[dialogCategory] || [] : [];
  const activeRetailer = selectedRetailers.find((retailer) => retailer.retailerId === selectedRetailerId);

  const handleOpenCategoryDialog = (categoryName) => {
    const retailersForCategory = categoryRetailerMap[categoryName] || [];
    if (!retailersForCategory.length) {
      alert("This item is currently out of stock across all shops.");
      return;
    }
    setDialogCategory(categoryName);
    setSelectedRetailerId(retailersForCategory[0].retailerId);
    setDesiredQty(1);
    setDialogOpen(true);
  };
  //Function to handle view all category
  const handleViewAllCategory = (categoryName) => {
    console.log('View all clicked for category:', categoryName);
    console.log('Current retailers:', filteredRetailers);
    setSelectedCategory(categoryName);
    setViewingCategory(true);
    // Scroll to the top of the page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  //handle back to main
  const handleBackToMain = () => {
    setViewingCategory(false);
    setSelectedCategory('');
  };


  const handleCloseDialog = () => {
    setDialogOpen(false);
    setDialogCategory(null);
    setSelectedRetailerId("");
    setDesiredQty(1);
  };

  const handleQuantityChange = (value) => {
    if (!activeRetailer) return;
    const parsed = parseInt(value, 10);
    const clamped = Math.max(1, Math.min(isNaN(parsed) ? 1 : parsed, activeRetailer.availableQty));
    setDesiredQty(clamped);
  };

  const handleAddToCart = () => {
  if (!activeRetailer || !dialogCategory) return;
  
  // Calculate delivery estimate
  const distance = activeRetailer.distanceKm || 0;
  const { estimatedDelivery, deliveryDays } = calculateEstimatedDeliveryDate(distance);
  
  addItem(
    {
      retailerId: activeRetailer.retailerId,
      retailerName: activeRetailer.retailerName,
      retailerEmail: activeRetailer.retailerEmail,
      category: dialogCategory,
      price: activeRetailer.price,
      availableQty: activeRetailer.availableQty,
      distanceKm: distance,
      estimatedDelivery: estimatedDelivery.toISOString(),
      deliveryDays,
      addedAt: new Date().toISOString()
    },
    desiredQty
  );
  
  alert(`${dialogCategory} added to cart from ${activeRetailer.retailerName}.\nEstimated delivery: ${formatDeliveryEstimate(estimatedDelivery)}`);
  handleCloseDialog();
};

  const scrollToCollections = () => {
    document.getElementById("customer-collections")?.scrollIntoView({ behavior: "smooth" });
  };

  const focusNearestBoutique = useCallback(() => {
    const nearestRetailer = retailersByDistance[0];
    if (!nearestRetailer) return;
    setMapCenter(nearestRetailer.location);
    const availableCategory = categories.find((cat) => (nearestRetailer.stock?.[cat.name] || 0) > 0);
    if (availableCategory) {
      handleOpenCategoryDialog(availableCategory.name);
    }
  }, [retailersByDistance]);

  const handleSeedDemoClick = async () => {
    try {
      setIsSeeding(true);
      await seedDemoData();
      alert("Demo retailers and wholesalers seeded around Hyderabad. Refresh to see them on the map.");
    } catch (error) {
      console.error("Failed to seed demo data", error);
      alert(`Unable to load demo stores: ${error?.message || "Unknown error"}`);
    } finally {
      setIsSeeding(false);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate("/login");
    } catch (error) {
      console.error("Failed to logout", error);
      alert("Unable to logout. Please try again.");
    }
  };

  if (viewingCategory && selectedCategory) {
    try {
      console.log('Rendering category view for:', selectedCategory);
      const selectedCategoryConfig = categories.find((cat) => cat.name === selectedCategory);
      const categoryItems = filteredRetailers
        .filter(retailer => {
          const hasStock = retailer.stock?.[selectedCategory] > 0;
          console.log(`Retailer ${retailer.id} has stock:`, hasStock, 'stock:', retailer.stock);
          return hasStock;
        })
        .map(retailer => {
          console.log('Mapping retailer:', retailer.id, 'with stock:', retailer.stock);
          return {
            ...retailer,
            category: selectedCategory,
            price: getRetailerPriceForCategory(retailer, selectedCategory),
            gradient: selectedCategoryConfig?.gradient,
          };
        });

      console.log('Category items:', categoryItems);

      return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <IconButton onClick={handleBackToMain} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h4" component="h1">
              {selectedCategory} ({categoryItems.length} items)
            </Typography>
          </Box>
          
          {categoryItems.length === 0 ? (
            <Typography>No items found for this category.</Typography>
          ) : (
            <Grid container spacing={3}>
              {categoryItems.map((item, index) => {
                const displayPrice = resolveDisplayPrice(item.price, selectedCategory);
                return (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={`${item.id}-${index}`}>
                    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <CardContent sx={{ flexGrow: 1 }} 
                      style={{  backgroundImage: item.gradient, 
                                backgroundSize: 'cover', 
                                backgroundPosition: 'center', 
                                backgroundRepeat: 'no-repeat', 
                                }}>
                        <Typography variant="h6" gutterBottom>
                          {item.name || 'Unnamed Retailer'}
                        </Typography>
                        <Typography color="textSecondary" gutterBottom>
                          {item.distanceKm ? `${item.distanceKm.toFixed(1)} km away` : 'Distance not available'}
                        </Typography>
                        <Typography variant="h6" color="primary">
                          ₹{displayPrice.toLocaleString()}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          Available: {item.stock?.[selectedCategory] || 0} units
                        </Typography>
                      </CardContent>
                      <CardActions>
                        <Button 
                          fullWidth 
                          variant="contained" 
                          onClick={() => {
                            const distance = item.distanceKm || 0;
                            const { estimatedDelivery } = calculateEstimatedDeliveryDate(distance);
                            addItem(
                              {
                                retailerId: item.id,
                                retailerName: item.name,
                                category: selectedCategory,
                                price: displayPrice,
                                availableQty: item.stock?.[selectedCategory] || 0,
                                distanceKm: distance,
                                estimatedDelivery: estimatedDelivery.toISOString(),
                                addedAt: new Date().toISOString()
                              },
                              1
                            );
                            alert(`${selectedCategory} added to cart from ${item.name}\nEstimated delivery: ${estimatedDelivery.toDateString()}\nPrice: ₹${displayPrice}`);
                          }}
                        >
                          Add to Cart
                        </Button>
                      </CardActions>
                    </Card>
                  </Grid>
                );
              })}
            </Grid>
          )}
        </Container>
      );
    } catch (error) {
      console.error('Error rendering category view:', error);
      return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <IconButton onClick={handleBackToMain} sx={{ mr: 2 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h5" color="error">
              Error loading {selectedCategory}
            </Typography>
          </Box>
          <Typography>Please try again later.</Typography>
          <Button 
            variant="contained" 
            onClick={handleBackToMain}
            sx={{ mt: 2 }}
          >
            Go Back
          </Button>
        </Container>
      );
    }
  }

  return (
    <Box className="page-shell" sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="glow-circle pink floating" />
      <div className="glow-circle blue" />
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          backgroundColor: "rgba(15,23,42,0.95)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          top: 0,
          position: 'sticky',
          width: '100%',
          flexShrink: 0
        }}
      >
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
            BITSmart Customer
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: '600px', ml: 2 }}>
            <TextField
              fullWidth
              variant="outlined"
              size="small"
              placeholder="Search boutiques..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ mb: 2, backgroundColor: "rgba(255, 255, 255, 1)" }}
              slotProps={{
                input: {
                  startAdornment: (
                    <Box sx={{ mr: 1, color: 'text.secondary' }}>🔍</Box>
                  ),
                },
              }}
            />

            <Stack direction="row" spacing={1}>
            <Button
              color="inherit"
              startIcon={
                <Badge badgeContent={totalItems} color="secondary" overlap="circular" showZero>
                  <ShoppingCartIcon />
                </Badge>
              }
              onClick={() => navigate("/cart")}
            >
              Cart
            </Button>
            <Button
              color="inherit"
              startIcon={<HistoryIcon />}
              onClick={() => navigate("/history")}
            >
              History
            </Button>
            <Button color="inherit" onClick={handleLogout}>
              Logout
            </Button>
          </Stack>
          </Box>
          {/* <Stack direction="row" spacing={1}>
            <Button
              color="inherit"
              startIcon={
                <Badge badgeContent={totalItems} color="secondary" overlap="circular" showZero>
                  <ShoppingCartIcon />
                </Badge>
              }
              onClick={() => navigate("/cart")}
            >
              Cart
            </Button>
            <Button
              color="inherit"
              startIcon={<HistoryIcon />}
              onClick={() => navigate("/history")}
            >
              History
            </Button>
            <Button color="inherit" onClick={handleLogout}>
              Logout
            </Button>
          </Stack> */}
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1, py: { xs: 6, md: 10 } }}>
        {loadingRetailers ? (
          <Stack direction="column" alignItems="center" spacing={2} sx={{ py: 12 }}>
            <CircularProgress color="inherit" />
            <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)" }}>
              Loading boutiques and live stock...
            </Typography>
          </Stack>
        ) : (
          <>
            <Grid container spacing={4} alignItems="center">
              <Grid item xs={12} md={6}>
                <Typography variant="h2" className="gradient-text" sx={{ fontWeight: 700 }}>
                  Curate your boutique wardrobe effortlessly.
                </Typography>
                <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                  <Chip
                    label={
                      locationStatus === "ready"
                        ? "Showing nearby boutiques"
                        : locationStatus === "denied"
                        ? "Location access blocked—showing default city"
                        : locationStatus === "unsupported"
                        ? "Location unavailable on this browser"
                        : "Detecting your location…"
                    }
                    size="small"
                    sx={{ backgroundColor: "rgba(255,255,255,0.12)", color: "#f8fafc" }}
                  />
                </Stack>
                <Typography variant="h6" sx={{ mt: 2, color: "rgba(248,250,252,0.75)" }}>
                  Tap a category, choose a boutique with live stock, and add pieces to your cart for a single, secure checkout.
                </Typography>
                {retailersByDistance.length > 0 && (
                  <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                    <Chip
                      icon={<ShoppingCartIcon fontSize="small" />}
                      label={`${retailersByDistance[0].name} is ${formatDistanceLabel(retailersByDistance[0].distanceKm)}`}
                      sx={{ backgroundColor: "rgba(34,197,94,0.2)", color: "#bbf7d0" }}
                      onClick={focusNearestBoutique}
                    />
                  </Stack>
                )}
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 4 }}>
                  <Button
                    variant="contained"
                    sx={{
                      px: 4,
                      py: 1.5,
                      fontWeight: 600,
                      background: "linear-gradient(120deg,#ec4899,#a855f7)",
                    }}
                    onClick={scrollToCollections}
                  >
                    Browse collections
                  </Button>
                  <Button
                    variant="outlined"
                    sx={{ borderColor: "rgba(248,250,252,0.4)", color: "#f8fafc" }}
                    onClick={() => navigate("/cart")}
                  >
                    View cart ({totalItems})
                  </Button>
                  <Button
                    variant="text"
                    sx={{ color: "rgba(248,250,252,0.8)" }}
                    onClick={handleSeedDemoClick}
                    disabled={isSeeding}
                  >
                    {isSeeding ? "Loading demo stores…" : "Load demo stores"}
                  </Button>
                </Stack>
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" color="textSecondary">
                    Showing {filteredRetailers.length} boutiques{selectedCategory ? ` with ${selectedCategory}` : ''}{searchTerm ? ` matching "${searchTerm}"` : ''}
                  </Typography>
                  <Slider
                    value={distanceFilterKm}
                    onChange={(_, value) => setDistanceFilterKm(value)}
                    valueLabelDisplay="auto"
                    min={5}
                    max={100}
                    step={5}
                  />
                </Box>
              </Grid>
              {/* <Grid container spacing={3} sx={{ mt: 1 }}>
              {categories.map((cat) => {
                const available = (categoryRetailerMap[cat.name] || []).length > 0;
                const closestRetailer = available ? categoryRetailerMap[cat.name][0] : null;
                return (
                  <Grid item key={cat.name} xs={12} sm={6} md={4}>
                    <Card
                      className="glass-panel"
                      sx={{
                        background: `${cat.gradient}`,
                        border: "none",
                        opacity: available ? 1 : 0.5,
                        transform: "translateY(0)",
                        transition: "transform 0.3s ease",
                        "&:hover": { transform: available ? "translateY(-8px)" : "none" },
                      }}
                    >
                      <CardActionArea disabled={!available} onClick={() => handleOpenCategoryDialog(cat.name)}>
                        <CardContent sx={{ py: 5, textAlign: "center" }}>
                          <Typography variant="h5" sx={{ fontWeight: 700 }}>{cat.name}</Typography>
                          <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.85)", mt: 1 }}>
                            {available
                              ? `${closestRetailer?.retailerName || "Nearby boutique"} · ${formatDistanceLabel(
                                  closestRetailer?.distanceKm
                                )}`
                              : "Coming back soon"}
                          </Typography>
                        </CardContent>
                      </CardActionArea>
                    </Card>
                  </Grid>
                );
              })}
            </Grid> */}
              <Grid item xs={12} md={6}>
                <Card className="glass-panel" sx={{ p: 3 }}>
                  <Typography variant="h5" sx={{ color: "rgba(5, 57, 109, 0.83)", mb: 2 }}>
                    This week
                  </Typography>
                  
                  
                  <Grid container spacing={2}>
                    {stats.map((stat) => (
                      <Grid item xs={12} sm={4} key={stat.title}>
                        <Box sx={{ p: 2, textAlign: 'center' }}>
                          <Typography variant="h6" sx={{ fontWeight: 600 }}>{stat.value}</Typography>
                          <Typography variant="body2" sx={{ color: "rgba(0, 5, 9, 0.7)" }}>{stat.title}</Typography>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                </Card>
              </Grid>
            </Grid>

            <Typography id="customer-collections" variant="h4" sx={{ mt: 8, fontWeight: 600 }}>
              Explore curated drops
            </Typography>
            <div className="neon-divider" />

            
            
            {/* Products Grid */}
            <Box sx={{ mt: 6 }}>
              <Grid container spacing={3}>
                {categories.map((category) => {
                  const categoryRetailers = categoryRetailerMap[category.name] || [];
                  const productCount = categoryRetailers.reduce(
                    (total, curr) => total + (curr.availableQty || 0), 0
                  );
                  
                  return (
                    <Grid item xs={12} key={category.name}>
                      <Card sx={{ mb: 4, background: 'rgba(255, 255, 255, 0.1)', backdropFilter: 'blur(10px)' }}>
                        <Box sx={{ p: 3 }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6" sx={{ fontWeight: 600,color:'rgba(252, 251, 248, 0.8)' }}>
                              {category.name}
                              <Typography component="span" sx={{ ml: 1, color: 'rgba(252, 251, 248, 0.8)' }}>
                                ({productCount} items)
                              </Typography>
                            </Typography>
                            <Button 
                              variant="outlined" 
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation(); 
                                handleViewAllCategory(category.name)
                              }} 
                              sx={{ textTransform: 'none' }}
                            >
                              View all
                            </Button>
                          </Box>
                          
                          <Grid container spacing={2}>
                            {categoryRetailers.slice(0, 4).map((retailer, idx) => {
                              const displayPrice = resolveDisplayPrice(retailer.price, category.name);
                              return (
                                <Grid item xs={6} sm={4} md={3} key={`${retailer.retailerId}-${idx}`}>
                                  <Card 
                                    sx={{ 
                                      height: '100%', 
                                      display: 'flex', 
                                      flexDirection: 'column',
                                      transition: 'transform 0.2s',
                                      '&:hover': {
                                        transform: 'translateY(-4px)',
                                        boxShadow: 3
                                      }
                                    }}
                                  >
                                    <Box 
                                      sx={{ 
                                        height: 160, 
                                        background: category.gradient,
                                        position: 'relative',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        fontSize: '2rem',
                                        fontWeight: 600,
                                        textShadow: '1px 1px 3px rgba(0,0,0,0.3)'
                                      }}
                                    >
                                      {category.name.charAt(0)}
                                    </Box>
                                    <CardContent sx={{ flexGrow: 1, p: 2 }}>
                                      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                                        {category.name}
                                      </Typography>
                                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                        {retailer.retailerName}
                                      </Typography>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="h6" color="primary">
                                          ₹{displayPrice.toLocaleString()}
                                        </Typography>
                                        <Chip 
                                          label={`${retailer.availableQty} in stock`} 
                                          size="small" 
                                          color={retailer.availableQty > 5 ? 'success' : 'warning'}
                                        />
                                      </Box>
                                    </CardContent>
                                    <CardActions>
                                      <Button 
                                        fullWidth 
                                        variant="contained" 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const distance = retailer.distanceKm || 0;
                                          const { estimatedDelivery } = calculateEstimatedDeliveryDate(distance);
                                          addItem(
                                            {
                                              retailerId: retailer.retailerId,
                                              retailerName: retailer.retailerName,
                                              category: category.name,
                                              price: displayPrice,
                                              availableQty: retailer.availableQty,
                                              distanceKm: distance,
                                              estimatedDelivery: estimatedDelivery.toISOString(),
                                              addedAt: new Date().toISOString()
                                            },
                                            1
                                          );
                                          alert(`${category.name} added to cart from ${retailer.retailerName}\nEstimated delivery: ${estimatedDelivery.toDateString()}\nPrice: ₹${displayPrice}`);
                                        }}
                                      >
                                        Add to Cart
                                      </Button>
                                    </CardActions>
                                  </Card>
                                </Grid>
                              );
                            })}
                          </Grid>
                        </Box>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Box>
            
            {/*Customer Reviews*/}
            <Grid container spacing={4} sx={{ mt: 6 }}>
              <Grid item xs={12} md={2} sx ={{width:'100%'}}>
                <Card className="glass-panel" sx={{ p: 3, height: 'fit-content' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, fontSize: '1rem' }}>What customers say</Typography>
                  <Stack spacing={1.5}>
                    {["1:1 messaging", "Smart picks", "Easy checkout"]
                      .map((item) => (
                        <Chip 
                          key={item} 
                          label={item} 
                          size="small"
                          sx={{ 
                            backgroundColor: "rgba(14, 0, 0, 0.08)", 
                            color: "#090909ff",
                            fontSize: '0.75rem',
                            height: '24px'
                          }} 
                        />
                      ))}
                  </Stack>
                </Card>
              </Grid>
              <Grid item xs={12} md={10} sx={{ width: '100%' }}>
                <Card className="glass-panel" sx={{ p: 0, overflow: 'hidden', width: '100%', height: '600px' }}>
                  {/*Stores near you*/}
                  <Box sx={{ p: 4 }}>
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>Stores near you</Typography>
                  </Box>

                  {/*Google Maps API implementation */}
                  <LoadScript googleMapsApiKey="AIzaSyCsN0VtNMbHd96oGj7Ch16FVqHQoyT0Uqc">
                    <GoogleMap mapContainerStyle={mapContainerStyle} center={mapCenter} zoom={12}>
                      <Marker position={customerLocation} label="You" />
                      {retailersByDistance.map((retailer) => (
                        <Marker
                          key={retailer.id}
                          position={retailer.location}
                          label={retailer.name?.slice(0, 1) || "R"}
                        />
                      ))}
                    </GoogleMap>
                  </LoadScript>
                </Card>
              </Grid>
            </Grid>
          </>
        )}
      </Container>

      

      {/* <Dialog open={dialogOpen} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>
          Choose a boutique for {dialogCategory}
          <IconButton
            size="large"
            onClick={handleCloseDialog}
            sx={{ position: "absolute", right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedRetailers.length === 0 ? (
            <Typography variant="body2">No boutiques currently have this item in stock.</Typography>
          ) : (
            <Stack spacing={2}>
              {selectedRetailers.map((retailer) => (
                <Card
                  key={retailer.retailerId}
                  variant="outlined"
                  sx={{
                    borderColor: retailer.retailerId === selectedRetailerId ? "#818cf8" : "rgba(255,255,255,0.2)",
                    backgroundColor: "rgba(15,23,42,0.5)",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedRetailerId(retailer.retailerId)}
                >
                  <CardContent>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {retailer.retailerName}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "rgba(248,250,252,0.7)" }}>
                      Available: {retailer.availableQty} units · ₹{retailer.price}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "rgba(248,250,252,0.6)" }}>
                      {formatDistanceLabel(retailer.distanceKm)}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
              {activeRetailer && (
                <TextField
                  label="Quantity"
                  type="number"
                  value={desiredQty}
                  onChange={(e) => handleQuantityChange(e.target.value)}
                  InputProps={{ inputProps: { min: 1, max: activeRetailer.availableQty } }}
                  helperText={`Max ${activeRetailer.availableQty} units available`}
                />
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddToCart}
            //disabled={!activeRetailer}
          >
            Add to cart
          </Button>
        </DialogActions>
      </Dialog> */}
    </Box>
  );
}
