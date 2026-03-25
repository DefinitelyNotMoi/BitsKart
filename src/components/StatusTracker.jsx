import { Box, Chip, Stack, Typography } from "@mui/material";

const STATUS_COLOR_MAP = {
  Delivered: "success",
  "Out for Delivery": "info",
  "In Transit": "info",
  Packed: "warning",
  Confirmed: "primary",
  Accepted: "primary",
  Placed: "secondary",
  Paid: "secondary",
  "Pending Confirmation": "secondary",
  Pending: "secondary",
  Cancelled: "error",
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return "—";
  if (typeof timestamp.toDate === "function") {
    return timestamp.toDate().toLocaleString();
  }
  if (timestamp.seconds) {
    return new Date(timestamp.seconds * 1000).toLocaleString();
  }
  return new Date(timestamp).toLocaleString();
};

export default function StatusTracker({ history = [], maxItems = 5, emptyLabel = "No updates yet." }) {
  if (!history?.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        {emptyLabel}
      </Typography>
    );
  }

  const sorted = [...history].sort((a, b) => {
    const aTime = a.timestamp?.toMillis?.() ?? a.timestamp?.seconds ?? 0;
    const bTime = b.timestamp?.toMillis?.() ?? b.timestamp?.seconds ?? 0;
    return aTime - bTime;
  });

  const trimmed = maxItems ? sorted.slice(-maxItems) : sorted;

  return (
    <Stack spacing={0.5} alignItems="flex-start">
      {trimmed.map((entry, idx) => (
        <Box
          key={`${entry.status}-${entry.timestamp?.seconds ?? idx}`}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          <Chip
            label={entry.status}
            size="small"
            color={STATUS_COLOR_MAP[entry.status] || "default"}
          />
          <Typography variant="caption" color="text.secondary">
            {formatTimestamp(entry.timestamp)}
          </Typography>
          {entry.note && (
            <Typography variant="caption" color="text.secondary">
              • {entry.note}
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}
