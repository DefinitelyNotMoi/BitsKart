// src/components/ImageUpload.jsx
import { useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const ImageUpload = ({ onImageUpload, label = "Upload Product Image" }) => {
  const [preview, setPreview] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
        onImageUpload(file);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Box sx={{ mb: 2 }}>
      <input
        accept="image/*"
        style={{ display: 'none' }}
        id="image-upload"
        type="file"
        onChange={handleImageChange}
      />
      <label htmlFor="image-upload">
        <Button
          variant="outlined"
          component="span"
          startIcon={<CloudUploadIcon />}
          fullWidth
        >
          {label}
        </Button>
      </label>
      {preview && (
        <Box sx={{ mt: 2, textAlign: 'center' }}>
          <Typography variant="caption" display="block" gutterBottom>
            Image Preview:
          </Typography>
          <img 
            src={preview} 
            alt="Preview" 
            style={{ 
              maxWidth: '100%', 
              maxHeight: '200px',
              borderRadius: '4px',
              marginTop: '8px'
            }} 
          />
        </Box>
      )}
    </Box>
  );
};

export default ImageUpload;