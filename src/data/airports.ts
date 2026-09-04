import type { Airport } from '../types'

export const AIRPORTS: Airport[] = [
  { code: 'GRU', name: 'Guarulhos Intl', city: 'São Paulo', country: 'Brasil', lat: -23.4356, lon: -46.4731 },
  { code: 'GIG', name: 'Galeão Intl', city: 'Rio de Janeiro', country: 'Brasil', lat: -22.8100, lon: -43.2506 },
  { code: 'BSB', name: 'Brasília Intl', city: 'Brasília', country: 'Brasil', lat: -15.8697, lon: -47.9208 },
  { code: 'CNF', name: 'Confins Intl', city: 'Belo Horizonte', country: 'Brasil', lat: -19.6336, lon: -43.9686 },
  { code: 'POA', name: 'Salgado Filho', city: 'Porto Alegre', country: 'Brasil', lat: -29.9944, lon: -51.1714 },
  { code: 'CWB', name: 'Afonso Pena', city: 'Curitiba', country: 'Brasil', lat: -25.5285, lon: -49.1758 },
  { code: 'SSA', name: 'Deputado Luís Eduardo Magalhães', city: 'Salvador', country: 'Brasil', lat: -12.9086, lon: -38.3225 },
  { code: 'REC', name: 'Guararapes', city: 'Recife', country: 'Brasil', lat: -8.1264, lon: -34.9236 },
  { code: 'MIA', name: 'Miami Intl', city: 'Miami', country: 'EUA', lat: 25.7959, lon: -80.2870 },
  { code: 'JFK', name: 'John F. Kennedy Intl', city: 'Nova York', country: 'EUA', lat: 40.6413, lon: -73.7781 },
  { code: 'LAX', name: 'Los Angeles Intl', city: 'Los Angeles', country: 'EUA', lat: 33.9416, lon: -118.4085 },
  { code: 'ORD', name: "O'Hare Intl", city: 'Chicago', country: 'EUA', lat: 41.9742, lon: -87.9073 },
  { code: 'MEX', name: 'Cidade do México Intl', city: 'Cidade do México', country: 'México', lat: 19.4363, lon: -99.0721 },
  { code: 'BOG', name: 'El Dorado Intl', city: 'Bogotá', country: 'Colômbia', lat: 4.7016, lon: -74.1469 },
  { code: 'SCL', name: 'Arturo Merino Benítez', city: 'Santiago', country: 'Chile', lat: -33.3930, lon: -70.7858 },
  { code: 'EZE', name: 'Ministro Pistarini', city: 'Buenos Aires', country: 'Argentina', lat: -34.8222, lon: -58.5358 },
  { code: 'LIS', name: 'Humberto Delgado', city: 'Lisboa', country: 'Portugal', lat: 38.7813, lon: -9.1359 },
  { code: 'MAD', name: 'Adolfo Suárez Barajas', city: 'Madrid', country: 'Espanha', lat: 40.4983, lon: -3.5676 },
  { code: 'LHR', name: 'Heathrow', city: 'Londres', country: 'Reino Unido', lat: 51.4700, lon: -0.4543 },
  { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'França', lat: 49.0097, lon: 2.5479 },
  { code: 'FRA', name: 'Frankfurt', city: 'Frankfurt', country: 'Alemanha', lat: 50.0379, lon: 8.5622 },
  { code: 'AMS', name: 'Schiphol', city: 'Amsterdã', country: 'Países Baixos', lat: 52.3105, lon: 4.7683 },
  { code: 'DXB', name: 'Dubai Intl', city: 'Dubai', country: 'EAU', lat: 25.2532, lon: 55.3657 },
  { code: 'JNB', name: 'OR Tambo', city: 'Joanesburgo', country: 'África do Sul', lat: -26.1392, lon: 28.2460 },
  { code: 'NRT', name: 'Narita Intl', city: 'Tóquio', country: 'Japão', lat: 35.7720, lon: 140.3929 },
  { code: 'SIN', name: 'Changi', city: 'Singapura', country: 'Singapura', lat: 1.3644, lon: 103.9915 },
  { code: 'SYD', name: 'Kingsford Smith', city: 'Sydney', country: 'Austrália', lat: -33.9399, lon: 151.1753 },
]

export function findAirport(code: string): Airport | undefined {
  return AIRPORTS.find((a) => a.code === code)
}
