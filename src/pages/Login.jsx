import { useState } from "react";
import { signInWithGoogle } from "../firebase";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

export default function Login() {
  const [role, setRole] = useState("Customer");
  const [otpStage, setOtpStage] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [enteredOtp, setEnteredOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    const user = await signInWithGoogle();
    if (!user) return;

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    console.info("Generated OTP (copy from console):", otp);
    setGeneratedOtp(otp);
    setOtpStage(true);
    setEnteredOtp("");
  };

  const handleVerifyOtp = () => {
    if (!enteredOtp) return;
    setIsVerifying(true);

    setTimeout(() => {
      const isValid = enteredOtp.trim() === generatedOtp;
      setIsVerifying(false);
      if (!isValid) {
        alert("Incorrect OTP. Please try again.");
        return;
      }

      if (role === "Customer") navigate("/customer");
      else if (role === "Retailer") navigate("/retailer");
      else navigate("/wholesaler");
    }, 400);
  };

  return (
    <Box className="page-shell" sx={{ overflow: "hidden" }}>
      <div className="glow-circle pink floating" />
      <div className="glow-circle blue" />
      <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 }, position: "relative", zIndex: 1 }}>
        <Stack direction={{ xs: "column", lg: "row" }} spacing={4} alignItems="stretch">
          <Card
            className="glass-panel"
            sx={{ flex: 1, p: { xs: 4, md: 6 }, display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            <Typography variant="h3" className="gradient-text" sx={{ fontWeight: 700 }}>
              Welcome back to BITSmart
            </Typography>
            <Typography variant="h6" sx={{ mt: 2, color: "rgba(174, 46, 149, 0.75)" }}>
              Authenticate with Google, grab the console OTP, and unlock a dashboard tailored to your role.
            </Typography>
            <Box sx={{ mt: 4, display: "grid", gap: 1 }}>
              {["Customers", "Retailers", "Wholesalers"].map((item) => (
                <Typography key={item} sx={{ color: "rgba(7, 86, 165, 0.76)" }}>
                  • {item} enjoy bespoke tooling, synchronized inventories, and delightful UI polish.
                </Typography>
              ))}
            </Box>
          </Card>

          <Card className="glass-panel" sx={{ flex: 1, p: { xs: 4, md: 5 } }}>
            <CardContent sx={{ p: 0, display: "flex", flexDirection: "column", gap: 3 }}>
              <Typography variant="h5" sx={{ fontWeight: 600 }}>
                {otpStage ? "Verify your OTP" : "Choose your portal"}
              </Typography>
              {!otpStage ? (
                <>
                  <FormControl fullWidth>
                    <InputLabel id="role-label">Login as</InputLabel>
                    <Select
                      labelId="role-label"
                      label="Login as"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <MenuItem value="Customer">Customer</MenuItem>
                      <MenuItem value="Retailer">Retailer</MenuItem>
                      <MenuItem value="Wholesaler">Wholesaler</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    size="large"
                    variant="contained"
                    onClick={handleLogin}
                    sx={{
                      py: 1.4,
                      background: "linear-gradient(120deg,#22d3ee,#6366f1)",
                      fontWeight: 600,
                    }}
                  >
                    Continue with Google
                  </Button>
                  {/* <Typography variant="body2" sx={{ color: "rgba(11, 116, 221, 0.6)", textAlign: "center" }}>
                    We log your OTP securely in the console. Paste it below to finish verifying.
                  </Typography> */}
                </>
              ) : (
                <>
                  <TextField
                    label="Enter OTP"
                    value={enteredOtp}
                    onChange={(e) => setEnteredOtp(e.target.value)}
                    inputProps={{ inputMode: "numeric", pattern: "[0-9]*" }}
                    fullWidth
                  />
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <Button
                      sx={{ flex: 1, py: 1.2, fontWeight: 600}}
                      variant="contained"
                      onClick={handleVerifyOtp}
                      disabled={isVerifying || !enteredOtp}
                    >
                      {isVerifying ? "Verifying..." : "Verify & Continue"}
                    </Button>
                    <Button
                      sx={{ flex: 1, py: 1.2, color: "#145bc6d2" }}
                      variant="outlined"
                      onClick={() => {
                        setOtpStage(false);
                        setGeneratedOtp("");
                        setEnteredOtp("");
                      }}
                    >
                      Cancel
                    </Button>
                  </Stack>
                  <Typography variant="caption" sx={{ color: "rgba(248,250,252,0.5)" }}>
                    Didn’t copy the OTP? Re-run the Google login to generate a fresh code.
                  </Typography>
                </>
              )}
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
}
