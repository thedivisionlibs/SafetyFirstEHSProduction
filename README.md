# SafetyFirst EHS

Enterprise-grade Environmental Health & Safety Management Platform by Umbra Global LLC.

Compete with Intelex and Vector EHS at a fraction of the cost.

## Features

### Core Modules
- **Incident Management** - Track and investigate workplace incidents with full lifecycle management
- **Action Items** - Corrective and preventive action tracking with due dates and verification
- **Inspections** - Customizable inspection checklists with scoring and findings
- **Training Management** - Course management, assignments, and completion tracking
- **Document Control** - Version-controlled document management with acknowledgments
- **OSHA 300 Logs** - Automatic generation and management of OSHA recordkeeping forms

### Additional Features
- **Dashboard** - Real-time KPIs and trend analytics
- **Audit Trail** - Complete activity logging for compliance
- **Role-Based Access** - Granular permissions for different user types
- **Subscription Tiers** - Free, Professional, and Enterprise plans
- **Email/Phone Verification** - Secure account verification
- **PDF Export** - OSHA 300, 300A, and 301 form generation
- **Excel Export** - Report and audit log export capabilities

## Tech Stack

- **Frontend**: React 18 (Single HTML file with Babel transformation)
- **Backend**: Node.js + Express.js (Single server file)
- **Database**: MongoDB with Mongoose ODM
- **Charts**: Recharts
- **Styling**: Tailwind CSS
- **Deployment**: Railway-ready configuration

## Project Structure

```
safetyfirst-ehs/
├── public/
│   └── index.html      # React frontend (SPA)
├── server.js           # Node.js/Express backend
├── package.json        # Dependencies
├── railway.toml        # Railway deployment config
├── .env.example        # Environment template
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

## Installation

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm or yarn

### Local Development

1. Clone the repository:
```bash
git clone <your-repo-url>
cd ehs-system
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start MongoDB (if running locally):
```bash
mongod
```

5. Start the server:
```bash
npm start
```

6. Access the application at `http://localhost:3000`

## Railway Deployment

1. Create a new project on [Railway](https://railway.app)

2. Add a MongoDB plugin to your project

3. Connect your GitHub repository

4. Set environment variables in Railway:
   - `JWT_SECRET` - A secure random string
   - `APP_URL` - Your Railway app URL
   - Other optional variables for email/SMS

5. Deploy! Railway will automatically:
   - Detect the Node.js project
   - Install dependencies
   - Start the server using the railway.toml configuration

## Subscription Tiers

| Tier | Price | Users | Key Features |
|------|-------|-------|--------------|
| **Starter** | $199/mo | 10 | Incidents, Actions, Inspections, Training, OSHA Logs |
| **Professional** | $499/mo | 50 | + Risk Assessments, JSA, Permits, Contractors, API |
| **Enterprise** | $1,299/mo | Unlimited | + Chemical/SDS, Health, Ergonomics, SSO |

## Application Routes

| Route | Description |
|-------|-------------|
| `/` | Public landing page |
| `/login` | User authentication |
| `/register` | Organization signup (14-day trial) |
| `/app` | Main application dashboard |
| `/superadmin` | Platform administration portal |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register organization and admin
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/verify-email` - Verify email address
- `POST /api/auth/verify-phone` - Verify phone number

### Incidents
- `GET /api/incidents` - List incidents (with pagination/filters)
- `GET /api/incidents/:id` - Get single incident
- `POST /api/incidents` - Create incident
- `PUT /api/incidents/:id` - Update incident
- `DELETE /api/incidents/:id` - Delete incident

### Action Items
- `GET /api/action-items` - List action items
- `GET /api/action-items/:id` - Get single action item
- `POST /api/action-items` - Create action item
- `PUT /api/action-items/:id` - Update action item
- `POST /api/action-items/:id/comments` - Add comment

### Inspections
- `GET /api/inspections` - List inspections
- `POST /api/inspections` - Create inspection
- `PUT /api/inspections/:id` - Update inspection
- `GET /api/inspection-templates` - List templates
- `POST /api/inspection-templates` - Create template

### Training
- `GET /api/training` - List training courses
- `POST /api/training` - Create training course
- `GET /api/training-records/my` - User's training records
- `POST /api/training-records` - Assign training
- `POST /api/training-records/:id/complete` - Complete training

### Documents
- `GET /api/documents` - List documents
- `POST /api/documents` - Upload document
- `PUT /api/documents/:id` - Update document

### OSHA Logs
- `GET /api/osha-logs/:year` - Get OSHA 300 log for year
- `PUT /api/osha-logs/:year` - Update OSHA log
- `POST /api/osha-logs/:year/sync` - Sync recordable incidents
- `GET /api/osha-logs/:year/export/:form` - Export PDF (300, 300a, 301)

### Reports & Admin
- `GET /api/dashboard` - Dashboard statistics
- `GET /api/reports/:type` - Generate reports
- `GET /api/audit-logs` - Audit log entries
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `GET /api/subscription` - Subscription info

## Security Features

- JWT-based authentication
- Password hashing with bcrypt
- Rate limiting
- Helmet security headers
- Input validation
- Role-based access control
- Audit logging
- Account lockout after failed attempts

## Default Test Account

After registering, you can create additional test accounts or use the registration to create your admin account.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `NODE_ENV` | Environment mode | No |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret (64+ chars) | Yes |
| `JWT_EXPIRES_IN` | Token expiration | No (default: 7d) |
| `APP_URL` | Application URL | Yes |
| `SUPER_ADMIN_EMAIL` | Platform admin email | No (default: admin@safetyfirst.com) |
| `SUPER_ADMIN_PASSWORD` | Platform admin password | No |
| `SMTP_HOST` | Email SMTP host | No |
| `SMTP_PORT` | Email SMTP port | No |
| `SMTP_USER` | Email username | No |
| `SMTP_PASS` | Email password | No |
| `EMAIL_FROM` | From email address | No |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | No |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | No |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | No |
| `ENCRYPTION_KEY` | 32-char encryption key | No |

## License

Proprietary - Umbra Global LLC

## Support

For issues and feature requests, please create an issue in the repository.

---

Built with ❤️ by Umbra Global LLC for EHS professionals
