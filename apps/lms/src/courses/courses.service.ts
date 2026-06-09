import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthUser, EventBus } from '@app/common';
import { CreateCourseDto, UpdateCourseDto } from './dto';

export interface Course {
  id: string;
  title: string;
  description?: string;
  instructorId: string;
  status: string;
  createdAt: string;
}
export interface Enrollment {
  id: string;
  courseId: string;
  userId: string;
  enrolledAt: string;
}

// In-memory data — swap for Prisma + Postgres (schema in docs/03-data-models.md).
@Injectable()
export class CoursesService {
  private courses = new Map<string, Course>();
  private enrollments = new Map<string, Enrollment>(); // key `${courseId}:${userId}`

  constructor(private readonly bus: EventBus) {}

  list(): Course[] {
    return [...this.courses.values()];
  }

  get(id: string): Course {
    const course = this.courses.get(id);
    if (!course) throw new NotFoundException({ code: 'NOT_FOUND', message: 'course not found' });
    return course;
  }

  create(dto: CreateCourseDto, user: AuthUser): Course {
    const course: Course = {
      id: randomUUID(),
      title: dto.title,
      description: dto.description,
      instructorId: user.id,
      status: 'draft',
      createdAt: new Date().toISOString(),
    };
    this.courses.set(course.id, course);
    return course;
  }

  // permission gate (course:update) happens in the controller; this adds the
  // resource-level ownership check (docs/08-authorization-rbac.md §6).
  update(id: string, dto: UpdateCourseDto, user: AuthUser): Course {
    const course = this.get(id);
    const isOwner = course.instructorId === user.id;
    const isAdmin = user.roles.includes('admin');
    if (!isOwner && !isAdmin) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'not your course' });
    Object.assign(course, dto);
    return course;
  }

  enroll(courseId: string, user: AuthUser, correlationId?: string): Enrollment {
    const course = this.get(courseId);
    const key = `${courseId}:${user.id}`;
    if (this.enrollments.has(key)) throw new ConflictException({ code: 'ALREADY_ENROLLED', message: 'already enrolled' });
    const enrollment: Enrollment = { id: randomUUID(), courseId, userId: user.id, enrolledAt: new Date().toISOString() };
    this.enrollments.set(key, enrollment);
    this.bus.publish(
      'enrollment.created',
      { userId: user.id, courseId, courseTitle: course.title },
      { producer: 'lms', correlationId },
    );
    return enrollment;
  }

  myEnrollments(userId: string): Enrollment[] {
    return [...this.enrollments.values()].filter((e) => e.userId === userId);
  }
}
