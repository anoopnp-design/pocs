# TP App - B2B Payment Collection System

A full-stack application for managing B2B payment collections with Razorpay integration.

## Tech Stack

- **Backend**: .NET 9 Web API with SQLite database
- **Frontend**: Angular 21
- **Payment Gateway**: Razorpay Smart Collect

## Quick Start

### Prerequisites
- .NET 9 SDK
- Node.js 20+ (LTS recommended)
- npm

### Setup

1. **Clone/Navigate to project**:
   ```bash
   cd tp-app
   ```

2. **Setup Backend**:
   ```bash
   cd backend
   dotnet restore
   dotnet build
   ```

3. **Setup Frontend**:
   ```bash
   cd ../frontend
   npm install
   npm run build
   ```

### Running the Application

#### Option 1: VS Code (Recommended)
1. Open the project in VS Code
2. Go to Run and Debug panel (Ctrl+Shift+D)
3. Select "Run Backend + Frontend" from the dropdown
4. Click the green play button

#### Option 2: Manual
1. **Terminal 1 - Backend**:
   ```bash
   cd backend
   dotnet run
   ```
   Backend will run on http://localhost:5000

2. **Terminal 2 - Frontend**:
   ```bash
   cd frontend
   npm start
   ```
   Frontend will run on http://localhost:4200

### Database
- Uses SQLite (`payment.db` in backend folder)
- Database is created automatically on first run
- No migrations needed

### Configuration
- Backend: `backend/appsettings.json`
- Frontend: `frontend/src/environments/environment.ts`

## Features

- **Trustee Dashboard**: View all sub-trustees and payment status
- **Sub-Trustee Management**: Add new sub-trustees with virtual accounts
- **Payment Expectations**: Set payment amounts and due dates
- **Transaction History**: View all payments received
- **Virtual Account Integration**: Automatic Razorpay VA creation

## API Endpoints

- `GET /api/trustees/dashboard` - Get dashboard data
- `POST /api/trustees` - Create sub-trustee
- `GET /api/trustees/{id}` - Get sub-trustee details
- `POST /api/trustees/{id}/expectations` - Set payment expectation

## Development

- Backend: Hot reload with `dotnet watch run`
- Frontend: Hot reload with `npm start`
- Database: SQLite file-based, no setup required