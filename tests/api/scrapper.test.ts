/** @jest-environment node */
import { POST } from '@/app/api/scraper/route';
import { NextRequest } from 'next/server';

describe('Scraper API Endpoint', () => {
  
  // SUCCESS PATH
  test('POST: should return 200 and map data correctly for a successful scrape', async () => {
    const mockResult = {
      scraped: true,
      data: { program: 'Bachelor of CS', enrollmentCumGPA: '3.5', enrollDate: '2024-01-01' },
      gridRows: [{ courseId: 'COS101', courseTitle: 'Unit A', credits: '12.5', status: 'Complete', grade: 'HD', term: 'S1' }]
    };

    const req = new NextRequest('http://localhost/api/scraper', {
      method: 'POST',
      body: JSON.stringify(mockResult)
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.course).toBe('Bachelor of CS');
    expect(data.courseList[0].courseId).toBe('COS101');
  });

  test('POST: normalizes missing and invalid optional portal fields', async () => {
    const incompleteResult = {
      scraped: true,
      data: { 
        program: null, 
        enrollmentCumGPA: "", 
        creditsRequiredFromEnrolment: "invalid-number" 
      },
      gridRows: []
    };

    const req = new NextRequest('http://localhost/api/scraper', {
      method: 'POST',
      body: JSON.stringify(incompleteResult)
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      course: '',
      cgpa: 0,
      creditsRequired: 0,
      creditsCompleted: 0,
      scheduledCredits: 0,
      gradeLevel: '',
      enrollmentDate: '',
      graduationDate: null,
      courseList: [],
    });
  });

  // PORTAL FAILURE PATH
  test('POST: should return 422 when the portal scraper fails', async () => {
    const mockFail = { scraped: false, error: 'Portal maintenance' };
    const req = new NextRequest('http://localhost/api/scraper', { 
      method: 'POST', 
      body: JSON.stringify(mockFail) 
    });

    const response = await POST(req);
    const data = await response.json();

    expect(response.status).toBe(422);
    expect(data.error).toBe('Portal maintenance');
  });

  //NEGATIVE PATHS: Malformed Payload
  describe("Scraper API - Malformed Payload (Line 39, 45)", () => {
    test("POST: should return 400 if JSON body is invalid", async () => {
      const req = new NextRequest('http://localhost/api/scraper', {
        method: 'POST',
        body: "not-json" 
      });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    test("POST: should return 400 if scrape result is missing 'scraped' key", async () => {
      const req = new NextRequest('http://localhost/api/scraper', {
        method: 'POST',
        body: JSON.stringify({ hello: 'world' }) 
      });
      const response = await POST(req);
      expect(response.status).toBe(400);
    });
  });
  
});
