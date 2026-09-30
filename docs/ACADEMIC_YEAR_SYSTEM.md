# Academic Year System Documentation

## Overview

The Academic Year System enables long-term support for student lifecycle management over a 10-year period. It automatically tracks student progression through grades (X, XI, XII) and handles graduation status based on enrollment academic year.

## Key Features

- **Automatic Class Progression**: Students automatically advance from X → XI → XII based on their enrollment year
- **Graduation Detection**: Students are automatically marked as graduated after completing 3 academic years
- **Academic Year Tracking**: Each student's enrollment academic year is stored (format: YYYY-YYYY)
- **Graduated Student Filtering**: Graduated students are excluded from active student lists for teachers
- **Manual Override**: Superadmins can manually mark students as graduated or reactivate them

## Database Schema Changes

### New Columns Added to `users` table:

1. **tahun_pelajaran** (VARCHAR(9))
   - Format: YYYY-YYYY (e.g., 2024-2025)
   - Stores the academic year when student first enrolled
   - Academic year runs from July to June
   - Example: Student enrolls in July 2024 → tahun_pelajaran = "2024-2025"

2. **is_graduated** (TINYINT(1))
   - Default: 0 (not graduated)
   - Values: 0 = active student, 1 = graduated
   - Automatically set when student completes 3 academic years

### New Columns Added to `student_creation_approvals` table:

1. **tahun_pelajaran** (VARCHAR(9))
   - Same format as users table
   - Ensures teacher approval requests include academic year information

## Migration Scripts

Run the following migration scripts in order:

1. `backend/database/migrations/004_add_academic_year_system.sql`
   - Adds tahun_pelajaran and is_graduated columns to users table
   - Creates indexes for performance

2. `backend/database/migrations/005_add_tahun_pelajaran_to_approvals.sql`
   - Adds tahun_pelajaran column to student_creation_approvals table

## Backend Implementation

### Utility Functions (`backend/utils/academicYear.js`)

- **validateTahunPelajaran(tahunPelajaran)**
  - Validates format: YYYY-YYYY
  - Ensures end year = start year + 1
  - Validates year range (2000-2100)

- **getCurrentAcademicYear()**
  - Returns current academic year based on date
  - Academic year: July to June
  - Example: August 2024 → returns "2024-2025"

- **calculateCurrentClass(enrollmentYear)**
  - Calculates current class based on enrollment year
  - Returns: 'X', 'XI', 'XII', or null (graduated)
  - Logic:
    - Year 0: X (10th grade)
    - Year 1: XI (11th grade)
    - Year 2: XII (12th grade)
    - Year 3+: Graduated

- **shouldGraduate(enrollmentYear)**
  - Returns true if student should be marked as graduated
  - Based on current class calculation

- **getClassInfo(enrollmentYear)**
  - Returns comprehensive class information
  - Includes current class, graduation status, and academic years

- **getAcademicYearOptions()**
  - Generates dropdown options (last 5 years to next 5 years)
  - Used in frontend forms

### API Endpoints (`backend/routes/academicYear.js`)

- **POST /api/academic-year/update-all-classes** (Superadmin only)
  - Updates all students' classes based on their tahun_pelajaran
  - Automatically marks students as graduated when appropriate
  - Should be run periodically (e.g., at start of academic year in July)

- **GET /api/academic-year/student/:id/class-info** (Authenticated)
  - Gets class information for a specific student
  - Returns both stored and calculated class data

- **POST /api/academic-year/student/:id/graduate** (Superadmin only)
  - Manually marks a student as graduated
  - Logs activity for audit trail

- **POST /api/academic-year/student/:id/reactivate** (Superadmin only)
  - Reactivates a graduated student (in case of error)
  - Logs activity for audit trail

## Frontend Changes

### Student Creation Form (`frontend/src/components/KelolaAkun.js`)

- Added "Tahun Pelajaran (Masuk)" dropdown field
- Required field when creating student accounts
- Options: Current year ± 5 years
- Includes helper text explaining the field

### Excel Import

- Updated import template to include "TahunPelajaran" column
- Added validation for tahun_pelajaran format during import
- Template auto-fills with current academic year

### Student List Display

- Graduated students show "Lulus" badge
- Graduated students' class shown in gray/italic
- Teachers only see active students (graduated filtered out)
- Superadmins see all students including graduated

## Academic Year Logic

### Academic Year Definition

- **Format**: YYYY-YYYY (e.g., 2024-2025)
- **Start**: July 1st
- **End**: June 30th
- **Example**: 2024-2025 runs from July 1, 2024 to June 30, 2025

### Class Progression Example

A student with `tahun_pelajaran = "2024-2025"`:

| Academic Year | Current Date | Class | Status |
|---------------|--------------|-------|--------|
| 2024-2025 | July 2024 - June 2025 | X | Active |
| 2025-2026 | July 2025 - June 2026 | XI | Active |
| 2026-2027 | July 2026 - June 2027 | XII | Active |
| 2027-2028 | July 2027 - June 2028 | - | Graduated |

### Automatic Class Updates

The system provides an API endpoint to update all classes at once:

```bash
POST /api/academic-year/update-all-classes
```

This should be called:
- At the start of each academic year (July)
- Or whenever class progression needs to be updated

## Usage Guide

### For Superadmins

1. **Creating New Students**
   - Select appropriate "Tahun Pelajaran" when creating account
   - This determines when the student will graduate
   - Format: YYYY-YYYY (e.g., 2024-2025)

2. **Updating Classes**
   - Use the "Update All Classes" endpoint at start of academic year
   - Or manually graduate/reactivate individual students

3. **Managing Graduated Students**
   - Graduated students appear with "Lulus" badge
   - Can still view their records and IPT history
   - Can reactivate if marked graduated by mistake

### For Teachers

- Only see active students in lists
- Graduated students automatically filtered out
- Can still access graduated student records via direct links

### For Students

- No changes to student interface
- Class progression is automatic
- Graduation status is transparent

## Testing Checklist

- [ ] Run migration scripts on database
- [ ] Create student with tahun_pelajaran
- [ ] Verify class calculation is correct
- [ ] Test automatic graduation after 3 years
- [ ] Test manual graduation/reactivation
- [ ] Verify Excel import with tahun_pelajaran
- [ ] Verify teacher view filters graduated students
- [ ] Verify superadmin view shows all students
- [ ] Test "Update All Classes" endpoint
- [ ] Validate tahun_pelajaran format enforcement

## Maintenance

### Annual Tasks (July)

1. Run class update endpoint:
   ```bash
   POST /api/academic-year/update-all-classes
   ```

2. Verify graduation status for students who should have graduated

3. Review and manually adjust any edge cases

### Data Integrity

- The system uses database indexes for performance
- All changes are logged in activity_logs
- Graduation status can be manually overridden if needed

## Troubleshooting

### Student not graduating automatically

- Check if `tahun_pelajaran` is set correctly
- Verify current academic year calculation
- Manually run the update-all-classes endpoint
- Check system date/time settings

### Student graduating too early

- Verify `tahun_pelajaran` format (YYYY-YYYY)
- Check if academic year calculation is correct
- Manually reactivate if needed

### Excel import failing

- Ensure "TahunPelajaran" column exists
- Verify format is YYYY-YYYY
- Check for typos in column name

## Future Enhancements

Potential improvements for future versions:

1. **Automatic Scheduled Updates**: Cron job to automatically update classes
2. **Batch Class Updates**: Update classes by specific year range
3. **Graduation Reports**: Generate graduation statistics and reports
4. **Historical Class Tracking**: Track class changes over time
5. **Custom Academic Years**: Support for non-standard academic year periods
