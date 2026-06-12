import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';

/**
 * Single EC2 host that runs the whole Sofin stack via docker-compose
 * (infra/docker-compose.prod.yml): the five NestJS services, both Next.js apps,
 * and self-hosted Postgres + RabbitMQ + Caddy.
 *
 * Tunables (override with `-c key=value` on `cdk deploy`):
 *   instanceType  EC2 size            (default t3.large — 8 GB, headroom to build on-box)
 *   volumeSize    root EBS GB         (default 30)
 *   sshCidr       CIDR allowed on :22 (default '' → no SSH; use SSM Session Manager)
 *   keyName       existing EC2 keypair name for SSH (optional)
 *   repoUrl       git repo to clone   (default the public Sofin repo)
 */
export class SofinStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const instanceType = this.node.tryGetContext('instanceType') ?? 't3.large';
    const volumeSize = Number(this.node.tryGetContext('volumeSize') ?? 30);
    const sshCidr = (this.node.tryGetContext('sshCidr') ?? '') as string;
    const keyName = this.node.tryGetContext('keyName') as string | undefined;
    const repoUrl =
      (this.node.tryGetContext('repoUrl') as string | undefined) ??
      'https://github.com/vanrin12/sofin.git';

    // Minimal VPC: one AZ, a single public subnet, no NAT gateway (cost: $0
    // beyond the instance + EIP). The host gets a public IP directly.
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 1,
      natGateways: 0,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      ],
    });

    const sg = new ec2.SecurityGroup(this, 'HostSg', {
      vpc,
      description: 'Sofin host — public web + (optional) SSH',
      allowAllOutbound: true,
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP');
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    if (sshCidr) {
      sg.addIngressRule(ec2.Peer.ipv4(sshCidr), ec2.Port.tcp(22), 'SSH');
    }

    // Instance role: SSM Session Manager (browser/CLI shell without SSH keys).
    const role = new iam.Role(this, 'HostRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });

    // Bootstrap: Docker + Compose v2 + git + a 4 GB swapfile (protects on-box
    // image builds on smaller instances), then clone the repo to /opt/sofin.
    // Compose is NOT auto-started: it needs infra/.env.prod with real secrets,
    // which the operator creates after connecting (see infra/cdk/README.md).
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      'set -euxo pipefail',
      'dnf update -y',
      'dnf install -y docker git',
      'systemctl enable --now docker',
      'usermod -aG docker ec2-user || true',
      'mkdir -p /usr/local/lib/docker/cli-plugins',
      'curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/lib/docker/cli-plugins/docker-compose',
      'chmod +x /usr/local/lib/docker/cli-plugins/docker-compose',
      // swap so `pnpm install` + `nx build` don't OOM during the image build
      'if [ ! -f /swapfile ]; then dd if=/dev/zero of=/swapfile bs=1M count=4096; chmod 600 /swapfile; mkswap /swapfile; swapon /swapfile; echo "/swapfile none swap sw 0 0" >> /etc/fstab; fi',
      `git clone ${repoUrl} /opt/sofin || true`,
      'chown -R ec2-user:ec2-user /opt/sofin || true',
      'echo "Sofin host ready. Next: cd /opt/sofin, create infra/.env.prod, then docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.prod up -d --build" > /etc/motd',
    );

    const host = new ec2.Instance(this, 'Host', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType(instanceType),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.X86_64,
      }),
      securityGroup: sg,
      role,
      userData,
      keyPair: keyName
        ? ec2.KeyPair.fromKeyPairName(this, 'KeyPair', keyName)
        : undefined,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(volumeSize, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true,
          }),
        },
      ],
    });

    // Stable public IP so DNS A records (api/app/admin) keep pointing here
    // across stops/starts.
    const eip = new ec2.CfnEIP(this, 'HostEip', { domain: 'vpc' });
    new ec2.CfnEIPAssociation(this, 'HostEipAssoc', {
      allocationId: eip.attrAllocationId,
      instanceId: host.instanceId,
    });

    new cdk.CfnOutput(this, 'PublicIp', { value: eip.ref, description: 'Elastic IP — point your DNS A records here' });
    new cdk.CfnOutput(this, 'InstanceId', { value: host.instanceId });
    new cdk.CfnOutput(this, 'SsmConnect', {
      value: `aws ssm start-session --target ${host.instanceId}`,
      description: 'Shell into the host (no SSH key needed)',
    });
  }
}
