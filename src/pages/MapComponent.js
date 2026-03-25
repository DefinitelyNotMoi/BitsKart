import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const containerStyle = {
  width: "100%",
  height: "400px",
  borderRadius: "16px",
  marginTop: "20px",
};

export default function MapComponent({ location, setLocation }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyCsN0VtNMbHd96oGj7Ch16FVqHQoyT0Uqc", 
  });

  if (loadError)
    return <div style={{ color: "red" }}>Error loading Google Maps</div>;
  if (!isLoaded) return <div>Loading map...</div>;

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={location}
      zoom={12}
      onClick={(e) =>
        setLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() })
      }
    >
      <Marker position={location} />
    </GoogleMap>
  );
}
