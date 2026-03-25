import { db } from "../firebase";
import { doc, setDoc } from "firebase/firestore";

const CATEGORY_NAMES = ["Shirts", "Trousers", "Jackets", "Shoes", "Accessories", "Ethnic Wear"];

const retailerTemplates = [
  {
    id: "demo-retailer-aurora",
    name: "Aurora Couture",
    email: "aurora@bitsmart.demo",
  },
  {
    id: "demo-retailer-vogue",
    name: "Vogue Lane",
    email: "voguelane@bitsmart.demo",
  },
  {
    id: "demo-retailer-indigo",
    name: "Indigo Thread",
    email: "indigo@bitsmart.demo",
  },
  {
    id: "demo-retailer-mint",
    name: "Mint & Marble",
    email: "mint@bitsmart.demo",
  },
  {
    id: "demo-retailer-lumina",
    name: "Lumina Boutique",
    email: "lumina@bitsmart.demo",
  },
];

const wholesalerTemplates = [
  {
    id: "demo-wholesaler-orion",
    name: "Orion Supply Co",
    email: "orion@bitsmart.demo",
    categories: CATEGORY_NAMES,
  },
  {
    id: "demo-wholesaler-nova",
    name: "Nova Distributors",
    email: "nova@bitsmart.demo",
    categories: CATEGORY_NAMES,
  },
  {
    id: "demo-wholesaler-atlas",
    name: "Atlas Garments",
    email: "atlas@bitsmart.demo",
    categories: CATEGORY_NAMES,
  },
];

const HYDERABAD_BOUNDS = {
  lat: { min: 17.34, max: 17.54 },
  lng: { min: 78.32, max: 78.57 },
};

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max) => Math.random() * (max - min) + min;

const getRandomHyderabadLocation = () => ({
  lat: Number(randomFloat(HYDERABAD_BOUNDS.lat.min, HYDERABAD_BOUNDS.lat.max).toFixed(5)),
  lng: Number(randomFloat(HYDERABAD_BOUNDS.lng.min, HYDERABAD_BOUNDS.lng.max).toFixed(5)),
});

const generateStock = () => {
  const stock = {};
  CATEGORY_NAMES.forEach((category) => {
    stock[category] = randomInt(10, 120);
  });
  return stock;
};

export async function seedDemoData() {
  await Promise.all(
    retailerTemplates.map(async (retailer) => {
      const location = getRandomHyderabadLocation();
      await setDoc(
        doc(db, "retailers", retailer.id),
        {
          name: retailer.name,
          email: retailer.email,
          location,
          createdAt: new Date(),
        },
        { merge: true }
      );
      await setDoc(doc(db, "stocks", retailer.id), generateStock(), { merge: true });
    })
  );

  await Promise.all(
    wholesalerTemplates.map(async (wholesaler) => {
      const location = getRandomHyderabadLocation();
      await setDoc(
        doc(db, "wholesalers", wholesaler.id),
        {
          name: wholesaler.name,
          email: wholesaler.email,
          categories: wholesaler.categories,
          location,
          createdAt: new Date(),
        },
        { merge: true }
      );
      await setDoc(doc(db, "stocks", wholesaler.id), generateStock(), { merge: true });
    })
  );
}
