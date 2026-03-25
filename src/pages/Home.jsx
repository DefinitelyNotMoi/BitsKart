import { Box, Card, CardContent, Chip, Container, Grid, Stack, Typography } from '@mui/material';
import CustomButton from '../components/CustomButton';
import styles from '../styles/Home.module.css';

const highlights = [
  { label: 'Live Inventory Sync', value: '24/7' },
  { label: 'Partner Retailers', value: '320+' },
  { label: 'Average Delivery', value: '< 48h' },
];

const personas = [
  {
    title: 'Customers',
    description: 'Discover curated collections, hyper-personalized to your neighbourhood trends.',
    cta: (<span style={{ color: '#ffffff' }}>Enter Boutique Experience</span>),
    route: '/customer',
    accent: '#34d399',
  },
  {
    title: 'Retailers',
    description: 'Source premium stock, track logistics, and delight your shoppers from one dashboard.',
    cta:(<span style={{ color: '#ffffff' }}>Go to Retail Control</span>),
    route: '/retailer',
    accent: '#60a5fa',
  },
  {
    title: 'Wholesalers',
    description: 'Broadcast inventory, analyze demand, and power the entire value chain.',
    cta:(<span style={{ color: '#ffffff' }}>Manage Wholesale Ops</span>),
    route: '/wholesaler',
    accent: '#c084fc',
  },
];

export default function Home() {

  return (
    <Box className={styles.pageShell}>
      <div className={`${styles.glowCircle} ${styles.pink} ${styles.floating}`} />
      <div className={`${styles.glowCircle} ${styles.blue}`} />
      <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          className={styles.glassPanel}
          sx={{
            p: { xs: 4, md: 6 },
            mt: 6,
            textAlign: 'center',
          }}
        >
          <Chip label="Intelligent Commerce Network" color="secondary" sx={{ mb: 3, fontWeight: 600 }} />
          <Typography variant="h2" className={styles.gradientText} sx={{ fontWeight: 700 }}>
            Design tomorrow's fashion supply chain.
          </Typography>
          <Typography variant="h6" sx={{ mt: 2, color: 'rgba(248,250,252,0.75)' }}>
            BITSmart unifies customers, boutique retailers, and wholesalers inside a single luminous experience.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} justifyContent="center" sx={{ mt: 4 }}>
            <CustomButton
              variant="contained"
              size="large"
              to="/login"
              sx={{
                px: 5,
                py: 1.5,
                background: 'linear-gradient(120deg,#6366f1,#ec4899)',
              }}
            >
              Get Started
            </CustomButton>
            <CustomButton
              variant="outlined"
              size="large"
              to="/login"
              sx={{ borderColor: 'rgba(248,250,252,0.4)', color: '#f8fafc' }}
            >
              Explore Demo
            </CustomButton>
          </Stack>

          <Grid container spacing={3} sx={{ mt: 5, justifyContent: 'center' }}>
            {highlights.map((item) => (
              <Grid item xs={12} md={4} key={item.label}>
                <Box sx={{ borderRadius: 3, p: 3, border: '1px solid rgba(255,255,255,0.15)' }}>
                  <Typography variant="h4" sx={{ fontWeight: 700 }}>{item.value}</Typography>
                  <Typography variant="body2" sx={{ color: 'rgba(248,250,252,0.7)' }}>{item.label}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Typography variant="h4" sx={{ mt: 8, mb: 3, fontWeight: 600 }}>
          Craft bespoke journeys for every role
        </Typography>
        <div className={styles.neonDivider} />
        <Grid container spacing={3} sx={{ mt: 1, justifyContent: 'center' }}>
          {personas.map((persona) => (
            <Grid item xs={12} md={4} key={persona.title} sx={{ display: 'flex', justifyContent: 'center' }}>
              <Card
                className={styles.glassPanel}
                sx={{
                  height: '100%',
                  width: '100%',
                  maxWidth: '400px',
                  borderColor: 'transparent',
                  p: 1,
                  background: 'rgba(15,23,42,0.6)',
                }}
              >
                <CardContent>
                  <Chip
                    label={persona.title}
                    sx={{
                      backgroundColor: 'rgba(255,255,255,0.1)',
                      color: persona.accent,
                      fontWeight: 600,
                      mb: 2,
                    }}
                  />
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    {persona.cta}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1.5, color: 'rgba(248,250,252,0.7)' }}>
                    {persona.description}
                  </Typography>
                  <CustomButton
                    fullWidth
                    sx={{
                      mt: 3,
                      py: 1.2,
                      fontWeight: 600,
                      background: `linear-gradient(120deg, ${persona.accent}, #0ea5e9)`
                    }}
                    variant="contained"
                    to={persona.route}
                  >
                    Launch {persona.title}
                  </CustomButton>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>
    </Box>
  );
}
