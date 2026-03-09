# Study Planner System

A locally deployed desktop application designed to assist Academic Advisors (Heads of Departments) in tracking student academic progression.

## Overview

The Study Planner System automates the detection of student majors, matches completed units against official study planners, imports student enrollment data, processes planner PDFs, and exports structured data to Excel. This is a full-scale Final Year Project (FYP) intended for real operational use.

## Core Features

- **Dashboard**: Unit Matching Visualization (Core Units, Electives, Missing Required Units)
- **Student Data Import**: Web scraping from existing university management portal or manual entry
- **Planner PDF Processing**: Extract unit codes and names from official planner PDFs
- **Excel Export**: Export student records, planner templates, and analytics summaries

## Tech Stack

- **Frontend**: Electron, Next.js, TypeScript
- **Backend**: Next.js (served locally via HTTPS)
- **Database**: PostgreSQL
- **Other**: OCR engine (Tesseract or equivalent), Excel generation library

## Deployment

This system is designed as a monolithic desktop application with local API separation. It must run entirely on the host machine with no cloud database or external storage of student data.