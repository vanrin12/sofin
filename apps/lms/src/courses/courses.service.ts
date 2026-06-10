import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Course, Enrollment } from '@sofin/prisma-lms';
import { AuthUser, outboxData } from '@app/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto, UpdateCourseDto } from './dto';

export type { Course, Enrollment };

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<Course[]> {
    return this.prisma.course.findMany();
  }

  async get(id: string): Promise<Course> {
    const course = await this.prisma.course.findUnique({ where: { id } });
    if (!course) throw new NotFoundException({ code: 'NOT_FOUND', message: 'course not found' });
    return course;
  }

  create(dto: CreateCourseDto, user: AuthUser): Promise<Course> {
    return this.prisma.course.create({
      data: { title: dto.title, description: dto.description, instructorId: user.id },
    });
  }

  // permission gate (course:update) is in the controller; this adds the
  // resource-level ownership check (docs/08-authorization-rbac.md §6).
  async update(id: string, dto: UpdateCourseDto, user: AuthUser): Promise<Course> {
    const course = await this.get(id);
    const isOwner = course.instructorId === user.id;
    const isAdmin = user.roles.includes('admin');
    if (!isOwner && !isAdmin) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'not your course' });
    return this.prisma.course.update({ where: { id }, data: dto });
  }

  async enroll(courseId: string, user: AuthUser, correlationId?: string): Promise<Enrollment> {
    const course = await this.get(courseId);
    // enrollment insert + enrollment.created outbox row in one transaction
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.enrollment.findUnique({
        where: { courseId_userId: { courseId, userId: user.id } },
      });
      if (existing) throw new ConflictException({ code: 'ALREADY_ENROLLED', message: 'already enrolled' });
      const enrollment = await tx.enrollment.create({ data: { courseId, userId: user.id } });
      await tx.outbox.create({
        data: outboxData({
          type: 'enrollment.created',
          payload: { userId: user.id, courseId, courseTitle: course.title },
          producer: 'lms',
          correlationId,
        }),
      });
      return enrollment;
    });
  }

  myEnrollments(userId: string): Promise<Enrollment[]> {
    return this.prisma.enrollment.findMany({ where: { userId } });
  }
}
