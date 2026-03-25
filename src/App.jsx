import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Customer from "./pages/Customer";
import Retailer from "./pages/Retailer";
import Wholesaler from "./pages/Wholesaler";
import CustomerCart from "./pages/CustomerCart";
import CustomerHistory from "./pages/CustomerHistory";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/customer" element={<Customer />} />
      <Route path="/cart" element={<CustomerCart />} />
      <Route path="/history" element={<CustomerHistory />} />
      <Route path="/retailer" element={<Retailer />} />
      <Route path="/wholesaler" element={<Wholesaler />} />
    </Routes>
  );
}

export default App;
