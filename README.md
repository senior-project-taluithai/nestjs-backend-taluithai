# Taluithai - Backend

Taluithai is an AI-powered travel planner for exploring Thailand. This repository contains the backend application built with NestJS, powering the agentic AI workflows, data management, and authentication.

## Tech Stack

- **Framework**: [NestJS 11](https://nestjs.com/)
- **Database**: 
  - PostgreSQL (with PostGIS) via [TypeORM](https://typeorm.io/)
  - MongoDB
- **Vector Database**: [Qdrant](https://qdrant.tech/) (for RAG & semantic search)
- **Caching & State**: Redis / [Upstash Redis](https://upstash.com/)
- **AI & Agents**: [LangChain](https://js.langchain.com/), [LangGraph](https://langchain-ai.github.io/langgraphjs/), Deepagents
- **Web Automation/Scraping**: [Playwright](https://playwright.dev/), [Apify](https://apify.com/)
- **Authentication**: JWT, Passport, Google Auth Library

## Prerequisites

- Node.js 22 or higher
- [pnpm](https://pnpm.io/) package manager
- [Docker](https://www.docker.com/) & Docker Compose

## Getting Started

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Set up environment variables**:
   Copy the `.env.example` file to `.env` and fill in the required credentials (Database, API keys, JWT secret, etc.).
   ```bash
   cp .env.example .env
   ```

3. **Start the database services**:
   The project includes a `docker-compose.yml` for spinning up PostgreSQL (with PostGIS extension) and pgAdmin.
   ```bash
   docker-compose up -d
   ```

4. **Run the development server**:
   ```bash
   pnpm start:dev
   ```
   The API will be available locally. If Swagger is configured, the documentation is typically accessible at `/api` or `/docs`.

## Key Features

- **Agentic Workflows**: Utilizes LangGraph and LangChain for orchestrating complex AI agents to generate dynamic travel itineraries.
- **Geospatial Data**: Integrates PostGIS to manage and query location-based POI details for Thailand.
- **RAG System**: Employs Qdrant for Retrieval-Augmented Generation to ensure context-aware and accurate AI responses.
- **Data Scraping**: Uses Playwright and Apify for gathering and analyzing up-to-date travel information.

## Scripts

- `pnpm start:dev`: Starts the local server in watch mode.
- `pnpm build`: Compiles the application to the `dist/` folder.
- `pnpm lint`: Lints code using ESLint and Prettier.
- `pnpm test`: Runs Jest unit tests.
- `pnpm format`: Formats code files using Prettier.
